'use client';

import {
  ArrowLeft,
  FileStack,
  FileText,
  ListFilter,
  Minus,
  Palette,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { parsePageRange } from '@/lib/pricing';

import { formatBytes, formatMoney } from './format';
import { PagePreview, ResetOverridesButton, type PreviewPage } from './page-preview';
import { PriceSummary } from './price-summary';
import type { DocumentStatus, Quote } from './types';

function RangeCard({
  selected,
  title,
  description,
  icon: Icon,
  onSelect,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: LucideIcon;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        selected
          ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600 dark:bg-emerald-950/40'
          : 'border-stone-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800/60',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          selected
            ? 'bg-emerald-600 text-white'
            : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm font-semibold',
            selected
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-stone-900 dark:text-stone-100',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
          {description}
        </span>
      </span>
    </button>
  );
}

export function ConfigStep({
  documentStatus,
  rangeMode,
  rangeText,
  rangeError,
  copies,
  copiesText,
  quote,
  quoteLoading,
  quoteError,
  pages,
  overrideCount,
  colorPrice,
  onTogglePageColor,
  onResetColorOverrides,
  onRangeModeChange,
  onRangeTextChange,
  onCopiesTextChange,
  onCopiesStep,
  onBack,
  onNext,
  onResetDocument,
}: {
  documentStatus: DocumentStatus;
  rangeMode: 'all' | 'custom';
  rangeText: string;
  rangeError: string | null;
  copies: number;
  copiesText: string;
  quote: Quote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  /** Эффективная цветность всех страниц (авто + ручные пометки). */
  pages: PreviewPage[];
  /** Сколько страниц помечено вручную. */
  overrideCount: number;
  /** Цена цветной страницы (для подсказки). */
  colorPrice: number;
  onTogglePageColor: (pageNumber: number) => void;
  onResetColorOverrides: () => void;
  onRangeModeChange: (mode: 'all' | 'custom') => void;
  onRangeTextChange: (text: string) => void;
  onCopiesTextChange: (text: string) => void;
  onCopiesStep: (delta: number) => void;
  onBack: () => void;
  onNext: () => void;
  onResetDocument: () => void;
}) {
  const totalPages = documentStatus.totalPages ?? 0;

  // Страницы, входящие в выбранный диапазон (для приглушения вне диапазона).
  // Невалидный диапазон — ничего не приглушаем (null).
  let printablePages: Set<number> | null = null;
  try {
    printablePages = new Set(
      parsePageRange(rangeMode === 'all' ? 'all' : rangeText, totalPages),
    );
  } catch {
    printablePages = null;
  }

  const colorTotal = pages.filter((page) => page.isColor).length;
  const bwTotal = pages.length - colorTotal;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        {/* Document chip */}
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
              {totalPages > 0 && ` · ${totalPages} стр.`}
              {documentStatus.colorPages !== null &&
                documentStatus.colorPages > 0 &&
                ` · ${documentStatus.colorPages} цветных`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            onClick={onResetDocument}
          >
            Сменить файл
          </Button>
        </div>

        {/* Page range */}
        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Страницы</CardTitle>
            <CardDescription>Выберите, что печатать</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="radiogroup"
              aria-label="Диапазон страниц"
              className="grid gap-3 sm:grid-cols-2"
            >
              <RangeCard
                selected={rangeMode === 'all'}
                title="Все страницы"
                description={
                  totalPages > 0 ? `Весь документ: ${totalPages} стр.` : 'Весь документ'
                }
                icon={FileStack}
                onSelect={() => onRangeModeChange('all')}
              />
              <RangeCard
                selected={rangeMode === 'custom'}
                title="Выбрать страницы"
                description="Например: 1-5, 10, 15-20"
                icon={ListFilter}
                onSelect={() => onRangeModeChange('custom')}
              />
            </div>

            {rangeMode === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="pf-page-range">Номера страниц</Label>
                <Input
                  id="pf-page-range"
                  value={rangeText}
                  onChange={(event) => onRangeTextChange(event.target.value)}
                  placeholder="например: 1-5, 10, 15-20"
                  autoComplete="off"
                  className="font-mono"
                  aria-invalid={Boolean(rangeError)}
                  aria-describedby={
                    rangeError ? 'pf-page-range-error' : 'pf-page-range-hint'
                  }
                />
                {rangeError ? (
                  <p
                    id="pf-page-range-error"
                    role="alert"
                    className="text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    {rangeError}
                  </p>
                ) : (
                  quote && (
                    <p
                      id="pf-page-range-hint"
                      className="text-sm text-stone-600 dark:text-stone-400"
                    >
                      Выбрано: {quote.pagesToPrint} стр. ({quote.colorPagesToPrint}{' '}
                      цветных)
                    </p>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Page colors + preview */}
        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="size-4 text-fuchsia-600" aria-hidden="true" />
              Цветность страниц
            </CardTitle>
            <CardDescription>
              Сервис определил цвет автоматически — нажмите на пометку под
              страницей, чтобы исправить
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                В документе:{' '}
                <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                  {colorTotal} цветн.
                </span>{' '}
                ·{' '}
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  {bwTotal} ч/б
                </span>
                {overrideCount > 0 && (
                  <span className="ml-1 text-xs text-stone-400">
                    ({overrideCount} {overrideCount === 1 ? 'пометка' : 'пометок'} изменено{' '}
                    вручную)
                  </span>
                )}
              </p>
              <ResetOverridesButton
                visible={overrideCount > 0}
                onReset={onResetColorOverrides}
              />
            </div>

            <PagePreview
              key={documentStatus.id}
              documentId={documentStatus.id}
              pages={pages}
              printablePages={printablePages}
              onToggleColor={onTogglePageColor}
            />

            {colorTotal > 0 && (
              <p className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
                Цветные страницы печатаются в цвете и считаются по цене цветной
                страницы — {formatMoney(colorPrice)} за лист.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Copies */}
        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Копии</CardTitle>
            <CardDescription>Сколько экземпляров печатать</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Уменьшить количество копий"
                disabled={copies <= 1}
                onClick={() => onCopiesStep(-1)}
                className="size-11 shrink-0"
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
              <Input
                value={copiesText}
                onChange={(event) =>
                  onCopiesTextChange(
                    event.target.value.replace(/\D/g, '').slice(0, 3),
                  )
                }
                onBlur={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  onCopiesTextChange(
                    String(Number.isNaN(parsed) || parsed < 1 ? 1 : Math.min(999, parsed)),
                  );
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Количество копий"
                aria-describedby="pf-copies-hint"
                className="h-11 w-20 text-center text-base font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Увеличить количество копий"
                disabled={copies >= 999}
                onClick={() => onCopiesStep(1)}
                className="size-11 shrink-0"
              >
                <Plus className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-sm text-stone-500 dark:text-stone-400">экз.</span>
            </div>
            <p
              id="pf-copies-hint"
              className="text-sm text-stone-600 dark:text-stone-400"
            >
              {quote
                ? `Листов всего: ${quote.pagesToPrint} × ${quote.copies} = ${quote.sheets}`
                : 'Листов всего: —'}
            </p>
          </CardContent>
        </Card>

        <Button
          type="button"
          variant="ghost"
          className="h-11 px-4 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Назад
        </Button>
      </div>

      {/* Sticky price summary (desktop right column) */}
      <div className="space-y-4 self-start lg:sticky lg:top-24">
        <PriceSummary
          quote={quote}
          isLoading={quoteLoading}
          errorText={quoteError}
        />
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base"
          disabled={!quote || quoteLoading}
          onClick={onNext}
        >
          Оформить заказ →
        </Button>
        <p className="text-center text-xs text-stone-500 dark:text-stone-400">
          Далее — контакты для получения заказа
        </p>
      </div>
    </div>
  );
}
