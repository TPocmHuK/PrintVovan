import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { apiError, type FileFormat } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** MIME-тип оригинала по формату файла. */
const ORIGINAL_CONTENT_TYPES: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** ASCII-фолбэк для filename= (не-ASCII символы допустимы только в filename*). */
function asciiFallbackName(fileName: string): string {
  const sanitized = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return sanitized === '' ? 'document' : sanitized;
}

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * GET /api/admin/orders/[id]/file?variant=print|original — файл заказа.
 * print (по умолчанию) — печатный PDF (printKey), оригинал — исходный файл
 * (storageKey; для pdf это тот же файл). Только для владельца (x-admin-token).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const variant = request.nextUrl.searchParams.get('variant') === 'original' ? 'original' : 'print';

  const order = await db.order.findUnique({
    where: { id },
    include: { document: true },
  });
  if (!order) {
    return apiError('Заказ не найден', 404);
  }
  const document = order.document;

  const fileKey = variant === 'print' ? (document.printKey ?? document.storageKey) : document.storageKey;
  let downloadName: string;
  if (variant === 'print') {
    const baseName = path.basename(document.fileName, path.extname(document.fileName)) || 'document';
    downloadName = `${baseName}.pdf`;
  } else {
    downloadName = document.fileName;
  }

  let file: Buffer;
  try {
    file = await fs.readFile(path.join(process.cwd(), 'uploads', fileKey));
  } catch {
    return apiError('Файл не найден', 404);
  }

  const contentType =
    variant === 'print'
      ? 'application/pdf'
      : ORIGINAL_CONTENT_TYPES[document.fileFormat as FileFormat] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${asciiFallbackName(downloadName)}"; filename*=UTF-8''${encodeFileName(downloadName)}`,
      'cache-control': 'no-store',
    },
  });
}
