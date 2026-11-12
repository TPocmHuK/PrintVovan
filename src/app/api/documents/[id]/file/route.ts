import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiError } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/file — печатный PDF документа для предпросмотра
 * на шаге настройки заказа. Для pdf-загрузок это оригинал; для DOC/DOCX —
 * конвертированный LibreOffice PDF (printKey). Доступ ограничен статусом
 * analyzed: id документа — неугадываемый cuid, выдаётся клиенту после загрузки.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const document = await db.document.findUnique({ where: { id } });
  if (!document) {
    return apiError('Документ не найден', 404);
  }
  if (document.analysisStatus !== 'analyzed' || document.totalPages == null) {
    return apiError('Документ ещё не готов к предпросмотру', 409);
  }

  const fileKey = document.printKey ?? document.storageKey;
  let file: Buffer;
  try {
    file = await fs.readFile(path.join(process.cwd(), 'uploads', fileKey));
  } catch {
    return apiError('Файл не найден', 404);
  }

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${document.id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
