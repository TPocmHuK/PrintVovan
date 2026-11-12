/** RU formatting helpers (client + server safe, locale-fixed formatters). */

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return moneyFormatter.format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} КБ`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace('.', ',')} МБ`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** «05.02, 14:30» */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormatter.format(date);
}

/** Client-side page range validation (mirrors the server grammar). */
export function validatePageRange(
  text: string,
  totalPages: number,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Укажите страницы для печати';
  if (!/^[\d\s,;\-–]+$/.test(trimmed)) return 'Страницы указаны некорректно';
  if (totalPages < 1) return 'Документ ещё не проанализирован';
  const tokens = trimmed.split(/[\s,;]+/).filter(Boolean);
  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!match) return 'Страницы указаны некорректно';
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (to < from) return 'Страницы указаны некорректно';
    if (from < 1 || from > totalPages) {
      return `Страница ${from} не существует (в документе ${totalPages} стр.)`;
    }
    if (to > totalPages) {
      return `Страница ${to} не существует (в документе ${totalPages} стр.)`;
    }
  }
  return null;
}

export function clampCopies(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(999, Math.max(1, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/* Round 2: DOC/DOCX upload support                                    */
/* ------------------------------------------------------------------ */

/** Accepted upload extensions (per ROUND 2 DELTA, section 1). */
export const UPLOAD_FORMATS = ['pdf', 'doc', 'docx'] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];

/** RU label used in badges: pdf → PDF, docx → DOCX… */
export function uploadFormatLabel(format: string): string {
  const normalized = format.trim().toLowerCase();
  return UPLOAD_FORMATS.includes(normalized as UploadFormat)
    ? normalized.toUpperCase()
    : 'PDF';
}

/** Extracts the accepted format from a file name; null when unsupported. */
export function getUploadFormat(fileName: string): UploadFormat | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return null;
  return (UPLOAD_FORMATS as readonly string[]).includes(ext)
    ? (ext as UploadFormat)
    : null;
}

/** Formats a coordinate for text inputs (up to 6 decimals, no trailing zeros). */
export function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(6)));
}

/** Parses a coordinate from an input; null when invalid or out of range. */
export function parseCoord(text: string, maxAbs: number): number | null {
  const value = Number.parseFloat(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || Math.abs(value) > maxAbs) return null;
  return value;
}
