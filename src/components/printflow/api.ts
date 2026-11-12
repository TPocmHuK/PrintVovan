/**
 * Thin fetch wrappers for the PrintFlow API.
 * All errors are normalized to `ApiError` carrying the RU server message.
 */
import type {
  AdminOrder,
  AdminOrdersResponse,
  AdminUpdateSettingsPayload,
  CreateOrderPayload,
  DocumentStatus,
  OrderCreated,
  OrderStatus,
  PatchOrderPayload,
  Quote,
  QuotePayload,
  SettingsPublic,
  TrackingOrder,
  UploadResponse,
} from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const NETWORK_ERROR_MESSAGE =
  'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function toApiError(res: Response): Promise<ApiError> {
  let message = 'Произошла ошибка. Попробуйте ещё раз';
  try {
    const body: unknown = await res.json();
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string' &&
      (body as { error: string }).error
    ) {
      message = (body as { error: string }).error;
    }
  } catch {
    // non-JSON error body — keep fallback message
  }
  return new ApiError(message, res.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('Некорректный ответ сервера', res.status);
  }
}

/* ------------------------------------------------------------------ */
/* Admin token (localStorage `pf_admin_token`, hydration-safe helpers) */
/* ------------------------------------------------------------------ */

export const ADMIN_TOKEN_KEY = 'pf_admin_token';

const TOKEN_EVENT = 'pf-admin-token-change';
const tokenListeners = new Set<() => void>();

/** Reads the stored admin token. Never call during SSR render directly —
 *  use it as a `useSyncExternalStore` snapshot instead. */
export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function subscribeAdminToken(onChange: () => void): () => void {
  tokenListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_TOKEN_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    tokenListeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function notifyTokenListeners() {
  tokenListeners.forEach((listener) => listener());
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  notifyTokenListeners();
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  notifyTokenListeners();
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function uploadDocument(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResponse>('/api/documents/upload', {
    method: 'POST',
    body: form,
  });
}

export function getDocumentStatus(documentId: string): Promise<DocumentStatus> {
  return request<DocumentStatus>(
    `/api/documents/${encodeURIComponent(documentId)}/status`,
  );
}

export function quoteOrder(payload: QuotePayload): Promise<Quote> {
  return request<Quote>('/api/orders/quote', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function createOrder(payload: CreateOrderPayload): Promise<OrderCreated> {
  return request<OrderCreated>('/api/orders', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function fetchTrackingOrder(code: string): Promise<TrackingOrder> {
  return request<TrackingOrder>(`/api/orders/${encodeURIComponent(code)}`);
}

export function fetchSettings(): Promise<SettingsPublic> {
  return request<SettingsPublic>('/api/settings');
}

/* ------------------------------------------------------------------ */
/* Admin API (header x-admin-token)                                    */
/* ------------------------------------------------------------------ */

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readAdminToken();
  if (!token) {
    throw new ApiError('Требуется авторизация', 401);
  }
  const headers = new Headers(init?.headers);
  headers.set('x-admin-token', token);
  return request<T>(path, { ...init, headers });
}

export function adminLogin(pin: string): Promise<{ token: string }> {
  return request<{ token: string }>('/api/admin/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ pin }),
  });
}

export function fetchAdminOrders(): Promise<AdminOrdersResponse> {
  return adminRequest<AdminOrdersResponse>('/api/admin/orders');
}

export function patchAdminOrder(
  orderId: string,
  payload: PatchOrderPayload,
): Promise<AdminOrder> {
  return adminRequest<AdminOrder>(
    `/api/admin/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    },
  );
}

export function updateAdminSettings(
  payload: AdminUpdateSettingsPayload,
): Promise<SettingsPublic> {
  return adminRequest<SettingsPublic>('/api/admin/settings', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

/** Which stored file to download: the printable PDF or the original upload. */
export type DownloadVariant = 'print' | 'original';

/** «report.docx» → «report.pdf» (mirrors the server's print attachment name). */
function printAttachmentName(fileName: string): string {
  const base = fileName.trim().replace(/\.[^.]+$/, '');
  return `${base || 'document'}.pdf`;
}

export async function downloadAdminOrderFile(
  orderId: string,
  fileName: string,
  variant: DownloadVariant = 'print',
): Promise<void> {
  const token = readAdminToken();
  if (!token) {
    throw new ApiError('Требуется авторизация', 401);
  }
  const query = variant === 'original' ? '?variant=original' : '';
  let res: Response;
  try {
    res = await fetch(
      `/api/admin/orders/${encodeURIComponent(orderId)}/file${query}`,
      { headers: { 'x-admin-token': token } },
    );
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    variant === 'original'
      ? fileName.trim() || 'document'
      : printAttachmentName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Human message for any thrown value (ApiError → its message). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Произошла ошибка. Попробуйте ещё раз';
}

/** Canonical display of the selected page range. */
export function formatRangeLabel(pageRangeText: string): string {
  const text = pageRangeText.trim().toLowerCase();
  return text === 'all' || text === '' ? 'все страницы' : pageRangeText.trim();
}
