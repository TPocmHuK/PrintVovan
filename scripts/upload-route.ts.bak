import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processDocument } from '@/lib/analysis';
import { apiError, type FileFormat } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 26_214_400; // 25 МБ
const FORMAT_ERROR_MESSAGE = 'Поддерживаются форматы PDF, DOC и DOCX';
const SIZE_ERROR_MESSAGE = 'Файл слишком большой (максимум 25 МБ)';

/** Магические байты по формату: PDF, DOCX (zip), DOC (OLE2). */
function detectFileFormat(fileName: string, buffer: Buffer): FileFormat | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') {
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null;
  }
  if (ext === '.docx') {
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
    return buffer.subarray(0, 4).equals(zipMagic) ? 'docx' : null;
  }
  if (ext === '.doc') {
    const ole2Magic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    return buffer.subarray(0, 8).equals(ole2Magic) ? 'doc' : null;
  }
  return null;
}

/**
 * POST /api/documents/upload — загрузка PDF/DOC/DOCX (multipart, поле `file`).
 * Валидация расширения/магических байт/размера, сохранение оригинала в uploads/,
 * создание Document (status queued) и фоновая обработка (fire-and-forget):
 * doc/docx сначала конвертируются в печатный PDF (LibreOffice), затем анализируются.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError('Файл не выбран', 400);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return apiError('Файл не выбран', 400);
  }

  const fileName =
    typeof file.name === 'string' && file.name.trim() !== '' ? file.name : 'document.pdf';
  if (file.size > MAX_FILE_SIZE) {
    return apiError(SIZE_ERROR_MESSAGE, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    return apiError(SIZE_ERROR_MESSAGE, 400);
  }

  // Расширение + магические байты: защита от «переименованных» файлов.
  const fileFormat = detectFileFormat(fileName, buffer);
  if (fileFormat === null) {
    return apiError(FORMAT_ERROR_MESSAGE, 400);
  }

  const documentId = randomUUID();
  const uploadsDir = path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  const storageKey = `${documentId}.${fileFormat}`;
  // Печатный PDF: для pdf — сам оригинал; для doc/docx — создаст конвертация.
  const printKey = fileFormat === 'pdf' ? storageKey : `${documentId}.print.pdf`;
  await fs.writeFile(path.join(uploadsDir, storageKey), buffer);

  const document = await db.document.create({
    data: {
      id: documentId,
      fileName,
      storageKey,
      fileFormat,
      printKey,
      sizeBytes: buffer.length,
      analysisStatus: 'queued',
    },
  });

  // Фоновая обработка: никогда не ждём и не роняем запрос.
  void processDocument(documentId).catch(() => {});

  return NextResponse.json({
    documentId: document.id,
    status: 'queued',
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
    fileFormat: document.fileFormat,
  });
}
