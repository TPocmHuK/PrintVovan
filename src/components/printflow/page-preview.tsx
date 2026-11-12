'use client';

/**
 * Предпросмотр страниц PDF (как в диалоге печати браузера).
 * Страницы рендерятся клиентским pdf.js из печатного PDF документа
 * (GET /api/documents/[id]/file). Каждая миниатюра — кнопка переключения
 * цветности; клик по картинке открывает крупный просмотр с навигацией.
 * Если PDF не загрузился — фолбэк на чипы с номерами страниц (тумблеры
 * цветности продолжают работать).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Palette,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* pdf.js (browser build, ленивый dynamic import)                      */
/* ------------------------------------------------------------------ */

interface PdfjsViewport {
  width: number;
  height: number;
  clone(params: { scale?: number }): PdfjsViewport;
}

interface PdfjsRenderTask {
  promise: Promise<void>;
  cancel(): void;
}

interface PdfjsPageProxy {
  getViewport(params: { scale: number }): PdfjsViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfjsViewport;
  }): PdfjsRenderTask;
  cleanup(): void;
}

interface PdfjsDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPageProxy>;
  destroy(): Promise<void>;
}

interface PdfjsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfjsDocumentProxy> };
}

let workerConfigured = false;

async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfjsModule;
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerConfigured = true;
  }
  return pdfjs;
}

/** Загружает печатный PDF документа через pdf.js. */
async function loadPdfDocument(documentId: string): Promise<PdfjsDocumentProxy> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/file`);
  if (!res.ok) {
    throw new Error(`PDF_HTTP_${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  return task.promise;
}

/* ------------------------------------------------------------------ */
/* Данные страницы для рендера                                         */
/* ------------------------------------------------------------------ */

export interface PreviewPage {
  pageNumber: number;
  /** Эффективная цветность (авто + ручные пометки). */
  isColor: boolean;
  /** Пометка изменена вручную (отличается от авторезультата). */
  overridden: boolean;
}

/* ------------------------------------------------------------------ */
/* Ленивый рендер одной страницы                                       */
/* ------------------------------------------------------------------ */

/** CSS-ширина миниатюры (px), совпадает с классами сетки. */
const THUMB_WIDTH = 152;

function PageThumb({
  doc,
  page,
  isPrintable,
  onToggleColor,
  onOpenZoom,
}: {
  doc: PdfjsDocumentProxy;
  page: PreviewPage;
  isPrintable: boolean;
  onToggleColor: (pageNumber: number) => void;
  onOpenZoom: (pageNumber: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<PdfjsRenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || visible || rendered) return;
    // Без IntersectionObserver (старые браузеры) — рендерим через rAF,
    // чтобы не вызывать setState синхронно в эффекте.
    if (typeof IntersectionObserver === 'undefined') {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, rendered]);

  useEffect(() => {
    if (!visible || rendered || failed) return;
    let cancelled = false;
    async function render() {
      try {
        const pageProxy = await doc.getPage(page.pageNumber);
        if (cancelled) return;
        const base = pageProxy.getViewport({ scale: 1 });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = ((THUMB_WIDTH + 8) / base.width) * dpr;
        const viewport = base.clone({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${THUMB_WIDTH}px`;
        canvas.style.height = 'auto';
        const task = pageProxy.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [visible, rendered, failed, doc, page.pageNumber]);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpenZoom(page.pageNumber)}
        aria-label={`Страница ${page.pageNumber} — открыть предпросмотр крупнее`}
        className={cn(
          'group relative block w-[152px] overflow-hidden rounded-lg border bg-white shadow-sm transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
          isPrintable
            ? 'border-stone-200 hover:border-emerald-400 hover:shadow-md dark:border-stone-700'
            : 'border-dashed border-stone-300 opacity-45 dark:border-stone-700',
        )}
      >
        <div className="flex h-[196px] w-[152px] items-center justify-center">
          {!rendered && !failed && <Loader2 className="size-5 animate-spin text-stone-300" aria-hidden="true" />}
          {failed && (
            <span className="px-2 text-center text-[10px] leading-tight text-stone-400">
              нет предпросмотра
            </span>
          )}
          <canvas ref={canvasRef} className={cn('max-w-full', !rendered && 'hidden')} aria-hidden="true" />
        </div>
        <span className="absolute bottom-1 left-1 rounded bg-stone-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {page.pageNumber}
        </span>
        {!isPrintable && (
          <span className="absolute right-1 top-1 rounded bg-stone-900/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
            не печатается
          </span>
        )}
      </button>

      <ColorToggle page={page} onToggleColor={onToggleColor} compact />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Тумблер цветности                                                   */
/* ------------------------------------------------------------------ */

function ColorToggle({
  page,
  onToggleColor,
  compact = false,
}: {
  page: PreviewPage;
  onToggleColor: (pageNumber: number) => void;
  compact?: boolean;
}) {
  const color = page.isColor;
  return (
    <button
      type="button"
      onClick={() => onToggleColor(page.pageNumber)}
      aria-pressed={color}
      aria-label={
        color
          ? `Страница ${page.pageNumber}: цветная — нажмите, чтобы сделать чёрно-белой`
          : `Страница ${page.pageNumber}: чёрно-белая — нажмите, чтобы сделать цветной`
      }
      title={
        color
          ? 'Цветная — нажмите, чтобы печатать ч/б'
          : 'Ч/б — нажмите, чтобы печатать в цвете'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs',
        color
          ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-300'
          : 'border-stone-300 bg-stone-100 text-stone-600 hover:bg-stone-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
      )}
    >
      <Palette className={compact ? 'size-2.5' : 'size-3.5'} aria-hidden="true" />
      {color ? 'Цветная' : 'Ч/б'}
      {page.overridden && (
        <span
          className={cn(
            'rounded-sm bg-current/15 px-1 text-[9px] font-bold uppercase',
          )}
          title="Пометка изменена вручную"
        >
          руч.
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Крупный просмотр (диалог)                                           */
/* ------------------------------------------------------------------ */

function ZoomCanvas({ doc, pageNumber }: { doc: PdfjsDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<PdfjsRenderTask | null>(null);
  // Родитель монтирует компонент с key=pageNumber — состояние всегда свежее.
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pageProxy = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = pageProxy.getViewport({ scale: 1 });
        const maxWidth = Math.min(640, window.innerWidth - 96);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = (maxWidth / base.width) * dpr;
        const viewport = base.clone({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${maxWidth}px`;
        canvas.style.height = 'auto';
        const task = pageProxy.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    }
    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [doc, pageNumber]);

  return (
    <div
      className={cn(
        'flex min-h-48 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-700',
        state !== 'ready' && 'bg-stone-50 dark:bg-stone-900',
      )}
    >
      {state === 'loading' && (
        <Loader2 className="size-6 animate-spin text-stone-400" aria-hidden="true" />
      )}
      {state === 'error' && (
        <span className="px-4 text-center text-sm text-stone-500">
          Не удалось отрисовать страницу
        </span>
      )}
      <canvas ref={canvasRef} className={cn('max-w-full', state !== 'ready' && 'hidden')} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Основной компонент                                                  */
/* ------------------------------------------------------------------ */

type PdfState =
  | { phase: 'loading' }
  | { phase: 'ready'; doc: PdfjsDocumentProxy }
  | { phase: 'error' };

export function PagePreview({
  documentId,
  pages,
  printablePages,
  onToggleColor,
}: {
  documentId: string;
  pages: PreviewPage[];
  /** Страницы, входящие в выбранный диапазон печати (остальные — приглушены). */
  printablePages: Set<number> | null;
  onToggleColor: (pageNumber: number) => void;
}) {
  const [pdfState, setPdfState] = useState<PdfState>({ phase: 'loading' });
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const docRef = useRef<PdfjsDocumentProxy | null>(null);

  // Компонент монтируется с key=documentId (свежий pdfState при смене файла),
  // поэтому синхронный сброс состояния в эффекте не нужен.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const doc = await loadPdfDocument(documentId);
        if (cancelled) {
          void doc.destroy().catch(() => {});
          return;
        }
        docRef.current = doc;
        setPdfState({ phase: 'ready', doc });
      } catch {
        if (!cancelled) setPdfState({ phase: 'error' });
      }
    }
    void load();
    return () => {
      cancelled = true;
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy().catch(() => {});
    };
  }, [documentId]);

  const zoomIndex = zoomPage === null ? -1 : pages.findIndex((p) => p.pageNumber === zoomPage);
  const zoomedPage = zoomIndex >= 0 ? pages[zoomIndex] : null;

  const goPrev = useCallback(() => {
    if (zoomIndex > 0) setZoomPage(pages[zoomIndex - 1].pageNumber);
  }, [zoomIndex, pages]);
  const goNext = useCallback(() => {
    if (zoomIndex >= 0 && zoomIndex < pages.length - 1) {
      setZoomPage(pages[zoomIndex + 1].pageNumber);
    }
  }, [zoomIndex, pages]);

  return (
    <div className="space-y-3">
      {pdfState.phase === 'loading' && (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          role="status"
          aria-label="Загружаем предпросмотр страниц"
        >
          {pages.slice(0, 8).map((page) => (
            <div
              key={page.pageNumber}
              className="flex h-[232px] w-[152px] flex-col items-center justify-center gap-2 rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900"
            >
              <Loader2 className="size-5 animate-spin text-stone-300" aria-hidden="true" />
              <span className="text-xs text-stone-400">стр. {page.pageNumber}</span>
            </div>
          ))}
        </div>
      )}

      {pdfState.phase === 'error' && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Картинки страниц недоступны — можно помечать цветность по номерам ниже.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {pages.map((page) => (
              <div key={page.pageNumber} className="flex flex-col items-center gap-1">
                <ColorToggle page={page} onToggleColor={onToggleColor} />
                <span className="text-[10px] text-stone-400">стр. {page.pageNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pdfState.phase === 'ready' && (
        <div className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pages.map((page) => (
            <PageThumb
              key={page.pageNumber}
              doc={pdfState.doc}
              page={page}
              isPrintable={printablePages === null || printablePages.has(page.pageNumber)}
              onToggleColor={onToggleColor}
              onOpenZoom={setZoomPage}
            />
          ))}
        </div>
      )}

      <Dialog
        open={zoomedPage !== null}
        onOpenChange={(open) => {
          if (!open) setZoomPage(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Страница {zoomedPage?.pageNumber ?? ''}
              {zoomedPage && (
                <ColorToggle page={zoomedPage} onToggleColor={onToggleColor} />
              )}
            </DialogTitle>
            <DialogDescription>
              Предпросмотр печатного файла · нажмите тумблер, чтобы изменить цветность
            </DialogDescription>
          </DialogHeader>

          {pdfState.phase === 'ready' && zoomedPage && (
            <ZoomCanvas
              key={zoomedPage.pageNumber}
              doc={pdfState.doc}
              pageNumber={zoomedPage.pageNumber}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goPrev}
              disabled={zoomIndex <= 0}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Пред.
            </Button>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {zoomIndex + 1} из {pages.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={zoomIndex < 0 || zoomIndex >= pages.length - 1}
            >
              След.
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Кнопка «Сбросить пометки» (используется снаружи рядом с предпросмотром). */
export function ResetOverridesButton({
  visible,
  onReset,
}: {
  visible: boolean;
  onReset: () => void;
}) {
  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
      onClick={onReset}
    >
      <RotateCcw className="size-3.5" aria-hidden="true" />
      Сбросить пометки
    </Button>
  );
}
