import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiError, ensureUploadRoute, mapDocumentStatus } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/status — статус анализа документа.
 * Для analyzed дополнительно отдаёт постраничную цветность (pages):
 * isColor — авторезультат, colorOverride — ручная пометка клиента.
 * Поллинг здесь — вторая точка самолечения upload-роута (ensureUploadRoute).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureUploadRoute();
  const { id } = await params;
  const document = await db.document.findUnique({
    where: { id },
    include: { pages: { orderBy: { pageNumber: 'asc' } } },
  });
  if (!document) {
    return apiError('Документ не найден', 404);
  }
  return NextResponse.json(mapDocumentStatus(document));
}
