/** Округление денежных значений до 2 знаков после запятой. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Предварительный расчёт стоимости печати (форма контракта Quote). */
export interface Quote {
  pagesToPrint: number;
  colorPagesToPrint: number;
  bwPagesToPrint: number;
  sheets: number;
  copies: number;
  pricePerPage: number;
  pricePerColorPage: number;
  subtotal: number;
  /** ч/б-часть subtotal (без копий). */
  subtotalBw: number;
  /** цветная часть subtotal (без копий). */
  subtotalColor: number;
  total: number;
}

function assertPageExists(page: number, totalPages: number): void {
  if (!Number.isInteger(page) || page < 1 || page > totalPages) {
    throw new RangeError(`Страница ${page} не существует (в документе ${totalPages} стр.)`);
  }
}

/**
 * Разбирает текст диапазона страниц по грамматике контракта.
 * «all» (без учёта регистра) — все страницы; иначе токены через `,` `;` или пробел:
 * «N» или «A-B» (также en dash). Дедупликация и сортировка по возрастанию.
 * Бросает RangeError с русским сообщением при ошибке.
 */
export function parsePageRange(text: string, totalPages: number): number[] {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new RangeError('Укажите страницы для печати');
  }
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new RangeError('Страницы указаны некорректно');
  }
  const normalized = text.trim();
  if (normalized.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const tokens = normalized.split(/[,;\s]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new RangeError('Страницы указаны некорректно');
  }
  const result = new Set<number>();
  for (const token of tokens) {
    const match = /^(\d+)(?:[-–—](\d+))?$/.exec(token);
    if (!match) {
      throw new RangeError('Страницы указаны некорректно');
    }
    const from = Number.parseInt(match[1], 10);
    if (match[2] === undefined) {
      assertPageExists(from, totalPages);
      result.add(from);
    } else {
      const to = Number.parseInt(match[2], 10);
      if (from > to) {
        throw new RangeError('Страницы указаны некорректно');
      }
      assertPageExists(from, totalPages);
      assertPageExists(to, totalPages);
      for (let page = from; page <= to; page++) result.add(page);
    }
  }
  if (result.size === 0) {
    throw new RangeError('Страницы указаны некорректно');
  }
  return Array.from(result).sort((a, b) => a - b);
}

/** Компактное описание списка страниц для UI: [1,2,3,5,10] → «1–3, 5, 10». */
export function describeRange(pages: number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  let prev = 0;
  for (const page of sorted) {
    if (prev > 0 && page === prev + 1) {
      prev = page;
      continue;
    }
    if (prev > 0) parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = page;
    prev = page;
  }
  if (prev > 0) parts.push(start === prev ? String(start) : `${start}–${prev}`);
  return parts.join(', ');
}

/**
 * Разбирает карту эффективной цветности страниц из тела запроса.
 * Формат: Record<"pageNumber", boolean> — ПОЛНАЯ карта для всех страниц
 * документа (1..totalPages), уже с учётом ручных пометок клиента.
 * Возвращает Map или текст ошибки (400).
 */
export function parseEffectivePageColors(
  raw: unknown,
  totalPages: number,
): Map<number, boolean> | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'Пометки цветности указаны некорректно';
  }
  const source = raw as Record<string, unknown>;
  const result = new Map<number, boolean>();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const value = source[String(pageNumber)];
    if (typeof value !== 'boolean') {
      return 'Пометки цветности указаны некорректно';
    }
    result.set(pageNumber, value);
  }
  if (Object.keys(source).length !== totalPages) {
    return 'Пометки цветности указаны некорректно';
  }
  return result;
}

/**
 * Считает стоимость печати: subtotal = ч/б × цена + цветные × цена_цветной,
 * total = subtotal × копии. Цветность страниц — эффективная (с учётом
 * ручных пометок клиента).
 */
export function buildQuote(
  pages: number[],
  pageIsColor: Map<number, boolean>,
  copies: number,
  pricePerPage: number,
  pricePerColorPage: number,
): Quote {
  const pagesToPrint = pages.length;
  let colorPagesToPrint = 0;
  for (const page of pages) {
    if (pageIsColor.get(page) === true) colorPagesToPrint += 1;
  }
  const bwPagesToPrint = pagesToPrint - colorPagesToPrint;
  const subtotalBw = round2(bwPagesToPrint * pricePerPage);
  const subtotalColor = round2(colorPagesToPrint * pricePerColorPage);
  const subtotal = round2(subtotalBw + subtotalColor);
  return {
    pagesToPrint,
    colorPagesToPrint,
    bwPagesToPrint,
    sheets: pagesToPrint * copies,
    copies,
    pricePerPage: round2(pricePerPage),
    pricePerColorPage: round2(pricePerColorPage),
    subtotal,
    subtotalBw,
    subtotalColor,
    total: round2(subtotal * copies),
  };
}
