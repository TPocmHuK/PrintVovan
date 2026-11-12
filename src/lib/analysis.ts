import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile, type ExecFileOptions } from 'child_process';
import { PDFDocument } from 'pdf-lib';
import { db } from '@/lib/db';

/** Допуск при сравнении компонент цвета (считаем близкие значения «серыми»). */
const COLOR_TOLERANCE = 0.02;
/** Таймаут ожидания объекта изображения из objs/commonObjs (мс). */
const IMAGE_LOOKUP_TIMEOUT_MS = 300;
const PDF_PARSE_ERROR_MESSAGE = 'Не удалось прочитать PDF — файл повреждён или защищён паролем';
const CONVERSION_ERROR_MESSAGE =
  'Не удалось преобразовать документ в PDF — возможно, файл повреждён или содержит пароль';
const GENERIC_ERROR_MESSAGE = 'Не удалось проанализировать документ, попробуйте загрузить его ещё раз';

/** Путь к LibreOffice (проверен в окружении: /usr/bin/soffice). */
const SOFFICE_BIN = '/usr/bin/soffice';
/** Таймаут конвертации одного документа (мс), по истечении процесс убивается. */
const SOFFICE_TIMEOUT_MS = 120_000;

// Минимальные типы pdfjs legacy build — используется только operator list (без canvas).
interface PdfjsObjectStore {
  get(objId: string, callback: (data: any) => void): unknown;
}
interface PdfjsOperatorList {
  fnArray: number[];
  argsArray: unknown[][];
}
interface PdfjsPageProxy {
  getOperatorList(): Promise<PdfjsOperatorList>;
  objs: PdfjsObjectStore;
  commonObjs: PdfjsObjectStore;
}
interface PdfjsDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPageProxy>;
}
interface PdfjsLoadingTask {
  promise: Promise<PdfjsDocumentProxy>;
  destroy(): Promise<void>;
}
interface PdfjsModule {
  OPS: Record<string, number | undefined>;
  getDocument(src: Record<string, unknown>): PdfjsLoadingTask;
}

/** Фатальная ошибка анализа: текст уходит в Document.errorMessage. */
class AnalysisFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisFatalError';
  }
}

function getDocumentFilePath(fileKey: string): string {
  return path.join(process.cwd(), 'uploads', fileKey);
}

/**
 * Модульная очередь конвертаций: soffice никогда не запускается параллельно —
 * каждая задача стартует только после завершения предыдущей (успех или ошибка).
 */
let conversionChain: Promise<void> = Promise.resolve();

function enqueueConversion<T>(task: () => Promise<T>): Promise<T> {
  const result = conversionChain.then(task, task);
  conversionChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

/**
 * Запускает soffice и ждёт завершения. Таймаут 120 с: child_process сам убивает
 * процесс по SIGKILL, дополнительно через +5 с снимаем всю группу процессов.
 */
function runSoffice(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let killTimer: NodeJS.Timeout | undefined;
    // detached нет в типе ExecFileOptions, но Node пробрасывает его в spawn:
    // ребёнок становится лидером группы — можно снять всю группу по таймауту.
    const options: ExecFileOptions & { detached: boolean } = {
      timeout: SOFFICE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      detached: true,
    };
    const child = execFile(SOFFICE_BIN, args, options, (error) => {
      if (killTimer) clearTimeout(killTimer);
      if (error) reject(error);
      else resolve();
    });
    // Страховка: child_process убивает только сам процесс, добиваем группу.
    killTimer = setTimeout(() => {
      if (child.pid && child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, SOFFICE_TIMEOUT_MS + 5_000);
    killTimer.unref();
  });
}

/** Переносит файл, устойчиво к разным ФС (rename → copy+unlink при EXDEV). */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EXDEV') throw error;
    await fs.copyFile(from, to);
    await fs.rm(from, { force: true }).catch(() => {});
  }
}

/**
 * Конвертирует DOC/DOCX в печатный PDF через LibreOffice headless.
 * Конвертация идёт во временную папку, готовый PDF переносится в uploads/{id}.print.pdf.
 * Ошибка/таймаут конвертации — любое исключение (ловится вызывающим кодом).
 */
async function convertOriginalToPdf(
  documentId: string,
  originalAbsPath: string,
  printAbsPath: string,
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `pf-conv-${documentId.slice(0, 8)}-`));
  // Уникальный профиль LibreOffice на документ — параллельно-безопасно.
  const profileUrl = `file://${path.join(os.tmpdir(), `pf-lo-${documentId}`)}`;
  const profileDir = path.join(os.tmpdir(), `pf-lo-${documentId}`);
  const args = [
    '--headless',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    tmpDir,
    `-env:UserInstallation=${profileUrl}`,
    originalAbsPath,
  ];
  try {
    await runSoffice(args);

    // Ищем единственный *.pdf во временной папке (при нескольких — совпадение по имени).
    const entries = await fs.readdir(tmpDir);
    const produced = entries.filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
    if (produced.length === 0) {
      throw new Error('LibreOffice не создал PDF');
    }
    const expectedName =
      `${path.basename(originalAbsPath, path.extname(originalAbsPath))}.pdf`.toLowerCase();
    const chosen = produced.find((name) => name.toLowerCase() === expectedName) ?? produced[0];
    await moveFile(path.join(tmpDir, chosen), printAbsPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Загружает PDF через pdfjs legacy build (параметры глушат лишние предупреждения). */
async function loadPdfjsDocument(
  buffer: Buffer,
): Promise<{ pdfjs: PdfjsModule; loadingTask: PdfjsLoadingTask; doc: PdfjsDocumentProxy }> {
  try {
    // Копируем байты: pdfjs может «отсоединить» ArrayBuffer при передаче воркеру.
    const data = new Uint8Array(buffer.byteLength);
    data.set(buffer);
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
    const loadingTask = pdfjs.getDocument({
      data,
      verbosity: 0,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    return { pdfjs, loadingTask, doc };
  } catch (error) {
    // Реальная причина — в логах сервера (на Render это виден в dashboard → Logs).
    console.error('[analysis] pdf.js не смог открыть PDF:', error);
    throw new AnalysisFatalError(PDF_PARSE_ERROR_MESSAGE);
  }
}

/** Количество страниц через pdf-lib; null — если не удалось (тогда пробуем pdfjs). */
async function loadPageCountWithPdfLib(buffer: Buffer): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/**
 * Разрешает kind объекта изображения через page.objs / page.commonObjs.
 * Регистрирует callback в обоих хранилищах и «гоняет» их с таймаутом 300 мс:
 * кто первый — тот и результат; таймаут/ошибка → null (объект игнорируем).
 */
function resolveImageKind(page: PdfjsPageProxy, objId: string): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (kind: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(kind);
    };
    const timer = setTimeout(() => finish(null), IMAGE_LOOKUP_TIMEOUT_MS);
    const onData = (obj: unknown) => {
      if (settled) return;
      if (!obj || typeof obj !== 'object') {
        finish(null);
        return;
      }
      const kind = (obj as { kind?: unknown }).kind;
      finish(typeof kind === 'number' ? kind : null);
    };
    try {
      page.objs.get(objId, onData);
    } catch {
      // объекта нет в objs — полагаемся на commonObjs/таймаут
    }
    try {
      page.commonObjs.get(objId, onData);
    } catch {
      // объекта нет и в commonObjs — сработает таймаут
    }
  });
}

/** kind изображения → цветность: 1 → ч/б, 2/3 → цвет, иначе неизвестно (null). */
function imageKindToColor(kind: number | null): boolean | null {
  if (kind === 1) return false;
  if (kind === 2 || kind === 3) return true;
  return null;
}

/** RGB-трио «нейтрально-серое» в пределах допуска. */
function isNeutralRgb(r: number, g: number, b: number, tol: number): boolean {
  return Math.abs(r - g) <= tol && Math.abs(g - b) <= tol;
}

/**
 * Приводит аргументы оператора к обычному массиву: pdfjs 4.x передаёт
 * аргументы цвета как типизированные массивы (Uint8ClampedArray), а не Array.
 */
function toOperatorArgs(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as ArrayLike<unknown>).length === 'number'
  ) {
    return Array.from(raw as ArrayLike<unknown>);
  }
  return [];
}

/**
 * Нормализует масштаб компонент цвета к 0..1: pdfjs 4.x отдаёт RGB-компоненты
 * байтами (0..255), контракт предполагает доли (0..1). Если хоть одна компонента > 1 —
 * считаем, что значения в байтовом масштабе, и делим на 255.
 */
function normalizeColorScale(values: number[]): number[] {
  return values.some((value) => value > 1) ? values.map((value) => value / 255) : values;
}

/** CMYK считается цветным, если есть ненулевая хрома вне допуска. */
function isColorCmyk(c: number, m: number, y: number, tol: number): boolean {
  const maxChroma = Math.max(c, m, y);
  return maxChroma > tol && !(Math.abs(c - m) <= tol && Math.abs(m - y) <= tol);
}

/**
 * Определяет, есть ли на странице цвет, по operator list pdfjs (без рендеринга).
 * Любое исключение наверх не бросается — вызывающий код считает страницу ч/б.
 */
async function pageHasColor(
  page: PdfjsPageProxy,
  opList: PdfjsOperatorList,
  ops: Record<string, number | undefined>,
): Promise<boolean> {
  const tol = COLOR_TOLERANCE;
  const setRgbOps = new Set<number | undefined>([ops.setFillRGBColor, ops.setStrokeRGBColor]);
  const grayOps = new Set<number | undefined>([
    ops.setFillGray,
    ops.setStrokeGray,
    ops.setFillGrayColor,
    ops.setStrokeGrayColor,
  ]);
  const cmykOps = new Set<number | undefined>([ops.setFillCMYKColor, ops.setStrokeCMYKColor]);
  const colorNOps = new Set<number | undefined>([ops.setFillColorN, ops.setStrokeColorN]);
  const imageObjOps = new Set<number | undefined>([ops.paintImageXObject, ops.paintImageXObjectRepeat]);
  const inlineImageOp = ops.paintInlineImageXObject;
  const inlineImageGroupOp = ops.paintInlineImageXObjectGroup;
  const kindCache = new Map<string, Promise<number | null>>();

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = toOperatorArgs(argsArray[i]);

    if (setRgbOps.has(fn)) {
      const r = args[0];
      const g = args[1];
      const b = args[2];
      if (
        typeof r === 'number' &&
        typeof g === 'number' &&
        typeof b === 'number' &&
        Number.isFinite(r) &&
        Number.isFinite(g) &&
        Number.isFinite(b)
      ) {
        const [nr, ng, nb] = normalizeColorScale([r, g, b]);
        if (!isNeutralRgb(nr, ng, nb, tol)) {
          return true;
        }
      }
    } else if (grayOps.has(fn)) {
      // серый цвет — страница остаётся ч/б, ничего не делаем
    } else if (cmykOps.has(fn)) {
      const c = args[0];
      const m = args[1];
      const y = args[2];
      if (
        typeof c === 'number' &&
        typeof m === 'number' &&
        typeof y === 'number' &&
        isColorCmyk(c, m, y, tol)
      ) {
        return true;
      }
    } else if (colorNOps.has(fn)) {
      // setFillColorN / setStrokeColorN: только если ВСЕ аргументы — числа
      if (args.length > 0 && args.every((arg) => typeof arg === 'number')) {
        const numeric = normalizeColorScale(args as number[]);
        if (numeric.length === 3 && !isNeutralRgb(numeric[0], numeric[1], numeric[2], tol)) {
          return true;
        }
        if (numeric.length === 4 && isColorCmyk(numeric[0], numeric[1], numeric[2], tol)) {
          return true;
        }
        // len 1 — серый (ч/б); остальные длины — pattern/неизвестно: игнорируем
      }
    } else if (imageObjOps.has(fn)) {
      const objId = args[0];
      if (typeof objId !== 'string') continue;
      let kindPromise = kindCache.get(objId);
      if (!kindPromise) {
        kindPromise = resolveImageKind(page, objId);
        kindCache.set(objId, kindPromise);
      }
      if (imageKindToColor(await kindPromise) === true) {
        return true;
      }
    } else if (fn === inlineImageOp) {
      const image = args[0] as { kind?: unknown } | undefined;
      if (image && typeof image === 'object' && (image.kind === 2 || image.kind === 3)) {
        return true;
      }
    } else if (fn === inlineImageGroupOp) {
      const group = args[0] as { images?: { kind?: unknown }[] } | undefined;
      const images = group && typeof group === 'object' ? group.images : undefined;
      if (
        Array.isArray(images) &&
        images.some(
          (img) => img && typeof img === 'object' && (img.kind === 2 || img.kind === 3),
        )
      ) {
        return true;
      }
    }
    // всё остальное — игнорируем
  }
  return false;
}

/**
 * Фоновый конвейер обработки документа:
 * 1) queued → конвертация DOC/DOCX в печатный PDF (LibreOffice, статусы converting);
 * 2) analyzing → количество страниц (pdf-lib → pdfjs) и постраничная детекция
 *    цвета через operator list pdfjs (без рендеринга).
 * Результат пишется в DocumentPage + totals, статус → analyzed.
 * Любая фатальная ошибка → статус failed с текстом. Функция никогда не бросает
 * исключение наружу.
 */
export async function processDocument(documentId: string): Promise<void> {
  try {
    const document = await db.document.findUnique({ where: { id: documentId } });
    if (!document) return;

    const storageKey = document.storageKey;
    let printKey = document.printKey ?? storageKey;

    // Стадия 1: конвертация DOC/DOCX в печатный PDF (строгая очередь, без параллели).
    if (document.fileFormat === 'doc' || document.fileFormat === 'docx') {
      await db.document.update({
        where: { id: documentId },
        data: { analysisStatus: 'converting', errorMessage: null },
      });
      const targetPrintKey = `${documentId}.print.pdf`;
      try {
        await enqueueConversion(() =>
          convertOriginalToPdf(
            documentId,
            getDocumentFilePath(storageKey),
            getDocumentFilePath(targetPrintKey),
          ),
        );
      } catch {
        throw new AnalysisFatalError(CONVERSION_ERROR_MESSAGE);
      }
      printKey = targetPrintKey;
      await db.document.update({ where: { id: documentId }, data: { printKey } });
    }

    // Стадия 2: анализ печатного PDF (для pdf-загрузок это сам оригинал).
    await db.document.update({
      where: { id: documentId },
      data: { analysisStatus: 'analyzing', errorMessage: null },
    });

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(getDocumentFilePath(printKey));
    } catch {
      throw new AnalysisFatalError('Файл документа не найден на сервере');
    }

    // 1. Количество страниц: сначала pdf-lib, при неудаче — pdfjs.
    let totalPages = await loadPageCountWithPdfLib(buffer);

    // 2. Открываем PDF через pdf.js. Если он недоступен (повреждён бандл,
    //    экзотический файл), но pdf-lib посчитал страницы — деградируем:
    //    заказ остаётся рабочим, все страницы считаются ч/б (цвет можно
    //    вручную пометить на шаге параметров).
    let pdfjs: PdfjsModule;
    let loadingTask: PdfjsLoadingTask;
    let doc: PdfjsDocumentProxy;
    try {
      ({ pdfjs, loadingTask, doc } = await loadPdfjsDocument(buffer));
    } catch (error) {
      if (
        error instanceof AnalysisFatalError &&
        typeof totalPages === 'number' &&
        totalPages > 0
      ) {
        console.warn(
          `[analysis] деградация: pdf.js недоступен, страницы известны (${totalPages}) — все ч/б`,
        );
        await db.$transaction([
          db.documentPage.deleteMany({ where: { documentId } }),
          db.documentPage.createMany({
            data: Array.from({ length: totalPages }, (_, index) => ({
              documentId,
              pageNumber: index + 1,
              isColor: false,
            })),
          }),
          db.document.update({
            where: { id: documentId },
            data: {
              analysisStatus: 'analyzed',
              totalPages,
              colorPages: 0,
              bwPages: totalPages,
              errorMessage: null,
            },
          }),
        ]);
        return;
      }
      throw error;
    }
    try {
      if (totalPages === null) totalPages = doc.numPages;

      // 2. Постраничная детекция цвета: сбой на странице → считаем её ч/б.
      const pageColors: boolean[] = [];
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        try {
          const page = await doc.getPage(pageNumber);
          const opList = await page.getOperatorList();
          pageColors.push(await pageHasColor(page, opList, pdfjs.OPS));
        } catch {
          pageColors.push(false);
        }
      }

      const colorCount = pageColors.filter(Boolean).length;
      await db.$transaction([
        db.documentPage.deleteMany({ where: { documentId } }),
        db.documentPage.createMany({
          data: pageColors.map((isColor, index) => ({
            documentId,
            pageNumber: index + 1,
            isColor,
          })),
        }),
        db.document.update({
          where: { id: documentId },
          data: {
            analysisStatus: 'analyzed',
            totalPages,
            colorPages: colorCount,
            bwPages: totalPages - colorCount,
            errorMessage: null,
          },
        }),
      ]);
    } finally {
      await loadingTask.destroy().catch(() => {});
    }
  } catch (error) {
    const message =
      error instanceof AnalysisFatalError ? error.message : GENERIC_ERROR_MESSAGE;
    await db.document
      .update({
        where: { id: documentId },
        data: { analysisStatus: 'failed', errorMessage: message },
      })
      .catch(() => {});
  }
}
