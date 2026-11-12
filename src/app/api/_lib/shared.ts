import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import type {
  Document as DbDocument,
  DocumentPage as DbDocumentPage,
  Order as DbOrder,
  OrderEvent as DbOrderEvent,
} from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

/* ------------------------------------------------------------------ */
/* Самолечение upload-роута                                            */
/* ------------------------------------------------------------------ */

/** Песочница периодически теряет каталог src/app/api/documents/upload
 *  при своём цикле сохранения/восстановления среды (дважды подтверждено:
 *  файл исчезает между сессиями, снапшот фиксирует отсутствие).
 *  Остальные файлы, включая новые, сохраняются нормально. Страховка:
 *  резервная копия + восстановление из дешёвых частых эндпоинтов. */
const UPLOAD_ROUTE_REL = 'src/app/api/documents/upload/route.ts';
/** Копия должна поставляться вместе с приложением (папка scripts/ под git) —
 *  тогда самовосстановление работает и на реальном сервере после git clone. */
const UPLOAD_ROUTE_BACKUP_REL = 'scripts/upload-route.ts.bak';
/** Здоровый route.ts весит ~3.8 КБ; меньше 2 КБ — считаем повреждённым. */
const UPLOAD_ROUTE_MIN_BYTES = 2000;
let uploadRouteRestores = 0;

/** Восстанавливает upload-роут из резервной копии, если он пропал/повреждён.
 *  Стоимость при здоровом файле — один statSync. Вызывается из GET /api/settings
 *  (срабатывает на каждой загрузке страницы, до любой попытки загрузить файл)
 *  и GET /api/documents/[id]/status (поллинг во время анализа). */
export function ensureUploadRoute(): void {
  // В production-образе (standalone) исходников нет — роут вшит в бандл,
  // а process.cwd() указывает на .next/standalone. Молча выходим,
  // чтобы не спамить логи попытками восстановления.
  if (!existsSync(path.join(process.cwd(), 'src', 'app'))) {
    return;
  }
  const routePath = path.join(process.cwd(), UPLOAD_ROUTE_REL);
  try {
    if (existsSync(routePath) && statSync(routePath).size >= UPLOAD_ROUTE_MIN_BYTES) {
      return;
    }
    const backupPath = path.join(process.cwd(), UPLOAD_ROUTE_BACKUP_REL);
    const content = readFileSync(backupPath, 'utf8');
    if (content.length < UPLOAD_ROUTE_MIN_BYTES) {
      console.error('[upload-guard] резервная копия повреждена, восстановление пропущено');
      return;
    }
    mkdirSync(path.dirname(routePath), { recursive: true });
    writeFileSync(routePath, content);
    uploadRouteRestores += 1;
    console.warn(
      `[upload-guard] ${UPLOAD_ROUTE_REL} отсутствовал — восстановлен из резервной копии (раз #${uploadRouteRestores})`,
    );
  } catch (error) {
    // Даже при сбое восстановления отдача settings/status не должна ломаться.
    console.error('[upload-guard] не удалось восстановить route.ts:', error);
  }
}

export type AnalysisStatus = 'queued' | 'converting' | 'analyzing' | 'analyzed' | 'failed';
export type FileFormat = 'pdf' | 'doc' | 'docx';

/** Статусы, в которых документ ещё не готов к расчёту/заказу. */
const PROCESSING_STATUSES: readonly string[] = ['queued', 'converting', 'analyzing'];

/** Документ ещё обрабатывается (queued/converting/analyzing)? */
export function isDocumentProcessing(analysisStatus: string): boolean {
  return PROCESSING_STATUSES.includes(analysisStatus);
}

/** 409-ответ для документов в процессе обработки (единый текст по контракту v2). */
export function documentProcessingError(): NextResponse {
  return apiError('Документ ещё обрабатывается, подождите несколько секунд', 409);
}

/** 409-ответ для документов, чей анализ завершился ошибкой. */
export function documentFailedError(): NextResponse {
  return apiError('Не удалось проанализировать документ', 409);
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'printing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'accepted',
  'printing',
  'ready',
  'completed',
  'cancelled',
] as const;

/** Допустимые переходы статусов заказа (контракт). */
export const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['printing', 'cancelled'],
  printing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Русские тексты событий по умолчанию. */
export const DEFAULT_EVENT_MESSAGES: Record<OrderStatus, string> = {
  pending: 'Заказ создан, ожидает подтверждения',
  accepted: 'Заказ принят в работу',
  printing: 'Идёт печать',
  ready: 'Заказ готов к выдаче',
  completed: 'Заказ выдан. Спасибо!',
  cancelled: 'Заказ отменён',
};

export interface DocumentPageColor {
  pageNumber: number;
  /** Авторезультат анализа. */
  isColor: boolean;
  /** Ручная пометка клиента: true = цветная, false = ч/б, null — нет правки. */
  colorOverride: boolean | null;
}

export interface DocumentSummary {
  fileName: string;
  totalPages: number | null;
  colorPages: number | null;
  bwPages: number | null;
}

export interface DocumentStatus extends DocumentSummary {
  id: string;
  status: AnalysisStatus;
  fileFormat: FileFormat;
  sizeBytes: number;
  errorMessage: string | null;
  /** Постраничная цветность (только для analyzed; отсутствует у старых серверов). */
  pages?: DocumentPageColor[];
}

export interface OrderEventDto {
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
  bwPagesToPrint: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage: number;
  totalPrice: number;
  customerName: string;
  createdAt: string;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  document: DocumentSummary;
  events: OrderEventDto[];
  pickup: { address: string; workingHours: string; readyEstimate: string };
}

export interface AdminOrder {
  id: string;
  code: string;
  status: OrderStatus;
  pageRangeText: string;
  pagesToPrint: number;
  colorPagesToPrint: number;
  bwPagesToPrint: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage: number;
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
    fileFormat: FileFormat;
  };
  events: OrderEventDto[];
}

export type OrderWithRelations = DbOrder & { document: DbDocument; events: DbOrderEvent[] };

/** Проверка значения статуса заказа. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/** Единый формат ошибок API: HTTP-статус + { "error": "русский текст" }. */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Безопасно читает JSON-объект из тела запроса; null при ошибке разбора. */
export async function readJson(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapEvent(event: DbOrderEvent): OrderEventDto {
  return {
    id: event.id,
    status: event.status as OrderStatus,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
  };
}

function documentSummary(doc: DbDocument): DocumentSummary {
  return {
    fileName: doc.fileName,
    totalPages: doc.totalPages,
    colorPages: doc.colorPages,
    bwPages: doc.bwPages,
  };
}

/** Document → DocumentStatus (формат GET /api/documents/[id]/status). */
export function mapDocumentStatus(
  doc: DbDocument & { pages?: DbDocumentPage[] },
): DocumentStatus {
  return {
    id: doc.id,
    status: doc.analysisStatus as AnalysisStatus,
    fileFormat: doc.fileFormat as FileFormat,
    fileName: doc.fileName,
    sizeBytes: doc.sizeBytes,
    totalPages: doc.totalPages,
    colorPages: doc.colorPages,
    bwPages: doc.bwPages,
    errorMessage: doc.errorMessage,
    pages: doc.pages
      ? [...doc.pages]
          .sort((a, b) => a.pageNumber - b.pageNumber)
          .map((page) => ({
            pageNumber: page.pageNumber,
            isColor: page.isColor,
            colorOverride: page.colorOverride,
          }))
      : undefined,
  };
}

/** Заказ с документом и событиями → AdminOrder (формат админ-API). */
export function mapAdminOrder(order: OrderWithRelations): AdminOrder {
  return {
    id: order.id,
    code: order.code,
    status: order.status as OrderStatus,
    pageRangeText: order.pageRangeText,
    pagesToPrint: order.pagesToPrint,
    colorPagesToPrint: order.colorPagesToPrint,
    bwPagesToPrint: order.bwPagesToPrint,
    copies: order.copies,
    pricePerPage: order.pricePerPage,
    pricePerColorPage: order.pricePerColorPage,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    comment: order.comment,
    createdAt: order.createdAt.toISOString(),
    acceptedAt: order.acceptedAt ? order.acceptedAt.toISOString() : null,
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    completedAt: order.completedAt ? order.completedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    document: {
      ...documentSummary(order.document),
      id: order.document.id,
      sizeBytes: order.document.sizeBytes,
      analysisStatus: order.document.analysisStatus as AnalysisStatus,
      fileFormat: order.document.fileFormat as FileFormat,
    },
    events: order.events.map(mapEvent),
  };
}

/** Заказ → TrackingOrder (публичное отслеживание по коду). */
export function mapTrackingOrder(
  order: OrderWithRelations,
  pickup: TrackingOrder['pickup'],
): TrackingOrder {
  return {
    code: order.code,
    status: order.status as OrderStatus,
    pageRangeText: order.pageRangeText,
    pagesToPrint: order.pagesToPrint,
    colorPagesToPrint: order.colorPagesToPrint,
    bwPagesToPrint: order.bwPagesToPrint,
    copies: order.copies,
    pricePerPage: order.pricePerPage,
    pricePerColorPage: order.pricePerColorPage,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    completedAt: order.completedAt ? order.completedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    document: documentSummary(order.document),
    events: order.events.map(mapEvent),
    pickup,
  };
}
