/**
 * PrintFlow — shared types (mirror of agent-ctx/api-contracts.md).
 * Frontend-side duplicates; backend owns the authoritative definitions.
 */

/**
 * Round 2: 'converting' appears while LibreOffice turns DOC/DOCX into a
 * printable PDF (new server). Old servers never send it — UI treats any
 * unknown status as a transient one.
 */
export type AnalysisStatus =
  | 'queued'
  | 'converting'
  | 'analyzing'
  | 'analyzed'
  | 'failed';
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'printing'
  | 'ready'
  | 'completed'
  | 'cancelled';

/** SPA views driven by location.hash (#order | #track | #admin). */
export type View = 'order' | 'track' | 'admin';

export interface SettingsPublic {
  pricePerPage: number;
  /** Round 4: цена цветной страницы. Optional-safe — старые серверы не присылают. */
  colorPricePerPage?: number;
  pickupAddress: string;
  workingHours: string;
  readyEstimate: string;
  /** Round 2: map coordinates. Optional-safe — old servers omit them. */
  mapLat?: number;
  mapLon?: number;
}

/** Map coordinate fallbacks (пер. Тихий, д. 1, с. Татарская Башмаковка). */
export const DEFAULT_MAP_LAT = 46.2494836;
export const DEFAULT_MAP_LON = 47.9870875;

/** Фолбэк цены цветной страницы. */
export const DEFAULT_COLOR_PRICE = 10;

/** Fallbacks (per contract defaults) — used while GET /api/settings fails/loads. */
export const DEFAULT_SETTINGS: SettingsPublic = {
  pricePerPage: 3,
  colorPricePerPage: DEFAULT_COLOR_PRICE,
  pickupAddress: 'Астраханская область, село Татарская Башмаковка, переулок Тихий, дом 1',
  workingHours: 'Пн–Пт: 9:00–19:00 · Сб: 10:00–16:00 · Вс: выходной',
  readyEstimate: 'Обычно заказ готов в течение 2 часов в рабочее время',
  mapLat: DEFAULT_MAP_LAT,
  mapLon: DEFAULT_MAP_LON,
};

/** Эффективная цена цветной страницы (фолбэк для старых серверов). */
export function resolveColorPrice(settings?: SettingsPublic | null): number {
  const price = settings?.colorPricePerPage;
  return typeof price === 'number' && Number.isFinite(price) && price > 0
    ? price
    : DEFAULT_COLOR_PRICE;
}

/** Resilient map coords: fall back to defaults when missing/invalid. */
export function resolveMapCoords(settings?: SettingsPublic | null): {
  lat: number;
  lon: number;
} {
  const lat = settings?.mapLat;
  const lon = settings?.mapLon;
  return {
    lat:
      typeof lat === 'number' && Number.isFinite(lat) ? lat : DEFAULT_MAP_LAT,
    lon:
      typeof lon === 'number' && Number.isFinite(lon) ? lon : DEFAULT_MAP_LON,
  };
}

/** Постраничная цветность из статуса документа (Round 4). */
export interface DocumentPageColor {
  pageNumber: number;
  /** Авторезультат анализа. */
  isColor: boolean;
  /** Ручная пометка клиента: true = цветная, false = ч/б, null — нет правки. */
  colorOverride: boolean | null;
}

export interface DocumentStatus {
  id: string;
  status: AnalysisStatus;
  fileName: string;
  sizeBytes: number;
  totalPages: number | null;
  colorPages: number | null;
  bwPages: number | null;
  errorMessage: string | null;
  /** Round 2: 'pdf' | 'doc' | 'docx'. Old servers omit it — treat as 'pdf'. */
  fileFormat?: string;
  /** Round 4: постраничная цветность (analyzed); старые серверы не присылают. */
  pages?: DocumentPageColor[];
}

export interface Quote {
  pagesToPrint: number;
  colorPagesToPrint: number;
  bwPagesToPrint: number;
  /** pagesToPrint * copies */
  sheets: number;
  copies: number;
  pricePerPage: number;
  /** Round 4: цена цветной страницы и разбивка subtotal. Старые серверы не присылают. */
  pricePerColorPage?: number;
  subtotalBw?: number;
  subtotalColor?: number;
  /** pages × price */
  subtotal: number;
  /** subtotal * copies */
  total: number;
}

/**
 * Полная карта эффективной цветности (Round 4): Record<страница, цветная?>.
 * Ключи — числа (при JSON.stringify превращаются в строки).
 */
export type PageColorMap = Record<number, boolean>;

export interface QuotePayload {
  documentId: string;
  pageRangeText: string;
  copies: number;
  /** Round 4: полная карта эффективной цветности (учёт ручных пометок). */
  colorOverrides?: PageColorMap;
}

export interface OrderCreated {
  id: string;
  code: string;
  status: 'pending';
  pagesToPrint: number;
  colorPagesToPrint?: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage?: number;
  totalPrice: number;
  pickupAddress: string;
  readyEstimate: string;
}

export interface CreateOrderPayload {
  documentId: string;
  pageRangeText: string;
  copies: number;
  customerName: string;
  customerPhone: string;
  comment?: string;
  /** Round 4: полная карта эффективной цветности (учёт ручных пометок). */
  colorOverrides?: PageColorMap;
}

export interface DocumentSummary {
  fileName: string;
  totalPages: number | null;
  colorPages: number | null;
  bwPages: number | null;
}

export interface TimelineEvent {
  id: string;
  status: OrderStatus;
  message: string | null;
  createdAt: string;
}

export interface TrackingOrder {
  code: string;
  status: OrderStatus;
  pageRangeText: string;
  pagesToPrint: number;
  colorPagesToPrint: number;
  bwPagesToPrint?: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage?: number;
  totalPrice: number;
  customerName: string;
  createdAt: string;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  document: DocumentSummary;
  events: TimelineEvent[];
  pickup: { address: string; workingHours: string; readyEstimate: string };
}

export interface AdminOrder {
  id: string;
  code: string;
  status: OrderStatus;
  pageRangeText: string;
  pagesToPrint: number;
  colorPagesToPrint: number;
  bwPagesToPrint?: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage?: number;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
  comment: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  document: DocumentSummary & {
    id: string;
    sizeBytes: number;
    analysisStatus: AnalysisStatus;
    /** Round 2: 'pdf' | 'doc' | 'docx'. Old servers omit it — treat as 'pdf'. */
    fileFormat?: string;
  };
  events: TimelineEvent[];
}

export interface AdminOrdersStats {
  todayCount: number;
  activeCount: number;
  readyCount: number;
  queueSheets: number;
  revenueToday: number;
}

export interface AdminOrdersResponse {
  orders: AdminOrder[];
  stats: AdminOrdersStats;
}

export interface PatchOrderPayload {
  status: OrderStatus;
  note?: string;
}

export interface AdminUpdateSettingsPayload {
  pricePerPage: number;
  /** Round 4: optional — only sent when the server supports color pricing. */
  colorPricePerPage?: number;
  pickupAddress: string;
  workingHours: string;
  readyEstimate: string;
  currentPin?: string;
  newPin?: string;
  /** Round 2: optional — only sent when the server supports map settings. */
  mapLat?: number;
  mapLon?: number;
}

export interface UploadResponse {
  documentId: string;
  status: 'queued';
  fileName: string;
  sizeBytes: number;
  /** Round 2: 'pdf' | 'doc' | 'docx'. Old servers omit it — treat as 'pdf'. */
  fileFormat?: string;
}
