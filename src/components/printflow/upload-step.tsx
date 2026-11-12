'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Palette,
  UploadCloud,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { formatBytes } from './format';
import type { DocumentStatus } from './types';

export function UploadStep({
  uploading,
  documentId,
  documentStatus,
  isStatusLoading,
  onFileSelected,
  onReset,
}: {
  uploading: boolean;
  documentId: string | null;
  documentStatus: DocumentStatus | null;
  isStatusLoading: boolean;
  onFileSelected: (file: File) => void;
  onReset: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [pickerBlocked, setPickerBlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    // showPicker() — современный API: в отличие от click() он сообщает об
    // блокировке диалога окружением (например, песочницей окна предпросмотра)
    // выбрасыванием исключения, а не молча. Fallback — привычный click().
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        setPickerBlocked(false);
        return;
      } catch (error) {
        // NotAllowedError — просто потеряна user-activation, click() ещё может
        // открыть диалог. Остальные (SecurityError и т. п.) — диалог заблокирован
        // самим окружением (iframe-предпросмотр): показываем подсказку.
        if (
          !(error instanceof DOMException && error.name === 'NotAllowedError')
        ) {
          setPickerBlocked(true);
        }
      }
    }
    input.click();
  }

  function pickFile(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  const analyzing =
    documentId !== null &&
    (isStatusLoading ||
      documentStatus === null ||
      documentStatus.status === 'queued' ||
      documentStatus.status === 'analyzing');
  const converting = documentStatus?.status === 'converting';
  const analyzed = documentStatus?.status === 'analyzed';
  const failed = documentStatus?.status === 'failed';

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        // sr-only, а не display:none: в некоторых webview/старых Safari
        // programmatic-активация file input с display:none не открывает диалог.
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          pickFile(event.target.files);
          event.target.value = '';
        }}
      />

      {!documentId && !uploading && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Загрузить документ: перетащите файл или нажмите, чтобы выбрать"
          aria-disabled={uploading}
          onClick={() => openPicker()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            pickFile(event.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-12',
            dragOver
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
              : 'border-stone-300 bg-stone-50/50 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-stone-700 dark:bg-stone-900/50 dark:hover:bg-stone-900',
          )}
        >
          <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <UploadCloud className="size-7" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-stone-900 dark:text-stone-100">
              Перетащите файл сюда
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400">или</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-white px-6 dark:bg-stone-900"
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
          >
            Выбрать файл
          </Button>
          {pickerBlocked && (
            <p
              role="note"
              className="max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              Это окно блокирует диалог выбора файла (режим предпросмотра).
              Перетащите файл мышью — это работает — или откройте сайт в
              отдельной вкладке, там кнопка откроет выбор файла.
            </p>
          )}
          <p className="text-xs text-stone-400 dark:text-stone-500">
            PDF · DOC · DOCX · до 25 МБ · печать А4, ч/б и цветная
          </p>
        </div>
      )}

      {uploading && (
        <div
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
          role="status"
        >
          <Loader2
            className="size-5 shrink-0 animate-spin text-amber-600"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Загружаем файл…
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
              Отправляем документ на сервер
            </p>
          </div>
        </div>
      )}

      {converting && (
        <div
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
          role="status"
        >
          <Loader2
            className="size-5 shrink-0 animate-spin text-amber-600"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Преобразуем документ в PDF…
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
              Это может занять до минуты — файл большой?
            </p>
          </div>
        </div>
      )}

      {analyzing && (
        <div
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
          role="status"
        >
          <Loader2
            className="size-5 shrink-0 animate-spin text-amber-600"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Анализируем документ…
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
              Обычно это занимает несколько секунд
            </p>
          </div>
        </div>
      )}

      {analyzed && documentStatus && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                {documentStatus.fileName}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {formatBytes(documentStatus.sizeBytes)}
                {documentStatus.totalPages !== null &&
                  ` · ${documentStatus.totalPages} стр.`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
              onClick={onReset}
            >
              Сменить файл
            </Button>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Документ готов к настройке
              </p>
              <p className="text-sm text-emerald-700/90 dark:text-emerald-300/90">
                {documentStatus.totalPages} стр.
                {documentStatus.bwPages !== null &&
                  ` · ${documentStatus.bwPages} ч/б`}
              </p>
            </div>
          </div>

          {documentStatus.colorPages !== null && documentStatus.colorPages > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <Palette className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {documentStatus.colorPages} цветных — цветность можно исправить на следующем шаге
              </span>
            </p>
          )}
        </div>
      )}

      {failed && (
        <Alert
          variant="destructive"
          className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
        >
          <XCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Не удалось проанализировать документ</AlertTitle>
          <AlertDescription>
            {documentStatus?.errorMessage ||
              'Файл повреждён или защищён паролем.'}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:bg-transparent"
            onClick={onReset}
          >
            Загрузить другой файл
          </Button>
        </Alert>
      )}
    </div>
  );
}
