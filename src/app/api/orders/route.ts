import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Order as DbOrder } from '@prisma/client';
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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PHONE_REGEX = /^\+?[\d\s\-()]{7,18}$/;

/** Генерирует код вида PF-XXXXXX (алфавит без 0/O/1/I). */
function generateOrderCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `PF-${code}`;
}

/** Признак нарушения уникальности Prisma (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * POST /api/orders — создание заказа.
 * Стоимость пересчитывается на сервере (данные клиента не доверенные).
 */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) {
    return apiError('Некорректные данные запроса', 400);
  }
  const { documentId, pageRangeText, copies, customerName, customerPhone, comment } = body;

  const name = typeof customerName === 'string' ? customerName.trim() : '';
  if (name.length < 2 || name.length > 80) {
    return apiError('Укажите имя (2–80 символов)', 400);
  }

  const phone = typeof customerPhone === 'string' ? customerPhone.trim() : '';
  if (!PHONE_REGEX.test(phone)) {
    return apiError('Укажите корректный телефон', 400);
  }

  const commentText = typeof comment === 'string' ? comment.trim() : '';
  if (commentText.length > 500) {
    return apiError('Комментарий слишком длинный (максимум 500 символов)', 400);
  }

  const copiesNumber = typeof copies === 'number' ? copies : Number(copies);
  if (!Number.isInteger(copiesNumber) || copiesNumber < 1 || copiesNumber > 999) {
    return apiError('Количество копий должно быть от 1 до 999', 400);
  }

  if (typeof documentId !== 'string' || documentId.trim() === '') {
    return apiError('Некорректные данные запроса', 400);
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

  const rangeText = typeof pageRangeText === 'string' ? pageRangeText : '';
  let pages: number[];
  try {
    pages = parsePageRange(rangeText, document.totalPages);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Страницы указаны некорректно', 400);
  }

  const settings = await getSettingsPublic();
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
  const quote = buildQuote(
    pages,
    pageIsColor,
    copiesNumber,
    settings.pricePerPage,
    settings.colorPricePerPage,
  );

  const orderData = {
    documentId: document.id,
    status: 'pending',
    pageRangeText: rangeText.trim(),
    pagesToPrint: quote.pagesToPrint,
    colorPagesToPrint: quote.colorPagesToPrint,
    bwPagesToPrint: quote.bwPagesToPrint,
    copies: copiesNumber,
    pricePerPage: quote.pricePerPage,
    pricePerColorPage: quote.pricePerColorPage,
    totalPrice: quote.total,
    customerName: name,
    customerPhone: phone,
    comment: commentText !== '' ? commentText : null,
  };

  // Эффективная цветность сохраняем на документе: где пометка клиента
  // отличается от авторезультата — пишем colorOverride, где совпадает — null.
  const overrideRows =
    body.colorOverrides !== undefined
      ? document.pages.map((page) => {
          const effectiveColor = pageIsColor.get(page.pageNumber) ?? page.isColor;
          return {
            pageNumber: page.pageNumber,
            colorOverride: effectiveColor === page.isColor ? null : effectiveColor,
          };
        })
      : [];

  // Генерация кода с повтором при коллизии уникального кода.
  let created: DbOrder | null = null;
  for (let attempt = 0; attempt < 10 && !created; attempt++) {
    try {
      created = await db.$transaction(async (tx) => {
        // Идемпотентно пишем colorOverride каждой страницы (null = авторезультат).
        for (const row of overrideRows) {
          await tx.documentPage.update({
            where: {
              documentId_pageNumber: {
                documentId: document.id,
                pageNumber: row.pageNumber,
              },
            },
            data: { colorOverride: row.colorOverride },
          });
        }
        const order = await tx.order.create({
          data: { ...orderData, code: generateOrderCode() },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: 'pending',
            message: 'Заказ создан, ожидает подтверждения',
          },
        });
        return order;
      });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  if (!created) {
    return apiError('Не удалось создать заказ, попробуйте ещё раз', 500);
  }

  return NextResponse.json({
    id: created.id,
    code: created.code,
    status: 'pending',
    pagesToPrint: created.pagesToPrint,
    colorPagesToPrint: created.colorPagesToPrint,
    copies: created.copies,
    pricePerPage: created.pricePerPage,
    pricePerColorPage: created.pricePerColorPage,
    totalPrice: created.totalPrice,
    pickupAddress: settings.pickupAddress,
    readyEstimate: settings.readyEstimate,
  });
}
