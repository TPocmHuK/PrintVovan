import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildQuote, parseEffectivePageColors, parsePageRange } from '@/lib/pricing';
import { getSettingsPublic } from '@/lib/settings';
import {
  apiError,
  documentFailedError,
  documentProcessingError,
  isDocumentProcessing,
  readJson,
} from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/quote — предварительный расчёт стоимости.
 * Тело: { documentId, pageRangeText, copies, colorOverrides? }.
 * colorOverrides — ПОЛНАЯ карта эффективной цветности (Record<"N", boolean>
 * для всех страниц), перекрывает авторезультат анализа. Документ должен быть
 * analyzed.
 */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) {
    return apiError('Некорректные данные запроса', 400);
  }
  const { documentId, pageRangeText, copies } = body;

  if (typeof documentId !== 'string' || documentId.trim() === '') {
    return apiError('Некорректные данные запроса', 400);
  }

  const copiesNumber = typeof copies === 'number' ? copies : Number(copies);
  if (!Number.isInteger(copiesNumber) || copiesNumber < 1 || copiesNumber > 999) {
    return apiError('Количество копий должно быть от 1 до 999', 400);
  }

  const document = await db.document.findUnique({
    where: { id: documentId },
    include: { pages: true },
  });
  if (!document) {
    return apiError('Документ не найден', 404);
  }
  if (isDocumentProcessing(document.analysisStatus)) {
    return documentProcessingError();
  }
  if (document.analysisStatus === 'failed' || document.totalPages == null) {
    return documentFailedError();
  }

  let pages: number[];
  try {
    pages = parsePageRange(
      typeof pageRangeText === 'string' ? pageRangeText : '',
      document.totalPages,
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Страницы указаны некорректно', 400);
  }

  let pageIsColor: Map<number, boolean>;
  if (body.colorOverrides !== undefined) {
    const effective = parseEffectivePageColors(body.colorOverrides, document.totalPages);
    if (typeof effective === 'string') {
      return apiError(effective, 400);
    }
    pageIsColor = effective;
  } else {
    pageIsColor = new Map<number, boolean>(
      document.pages.map((page) => [page.pageNumber, page.isColor]),
    );
  }
  const settings = await getSettingsPublic();
  const quote = buildQuote(
    pages,
    pageIsColor,
    copiesNumber,
    settings.pricePerPage,
    settings.colorPricePerPage,
  );
  return NextResponse.json(quote);
}
