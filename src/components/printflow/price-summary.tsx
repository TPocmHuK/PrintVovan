'use client';

import { motion } from 'framer-motion';
import { Banknote, Loader2, Palette, ReceiptText } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { formatMoney } from './format';
import type { Quote } from './types';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-stone-600 dark:text-stone-400">{label}</span>
      <span className="font-medium text-stone-900 dark:text-stone-100">{value}</span>
    </div>
  );
}

export function PriceSummary({
  quote,
  isLoading,
  errorText,
}: {
  quote: Quote | null;
  isLoading: boolean;
  errorText: string | null;
}) {
  return (
    <Card className="border-stone-200 shadow-sm dark:border-stone-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="size-4 text-emerald-600" aria-hidden="true" />
          Расчёт стоимости
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorText && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {errorText}
          </p>
        )}

        {!errorText && !quote && (
          <div className="space-y-2.5">
            {isLoading ? (
              <>
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-9 w-1/2" />
              </>
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Выберите страницы и количество копий — стоимость пересчитается
                автоматически.
              </p>
            )}
          </div>
        )}

        {quote && (
          <>
            <div className="space-y-2">
              {quote.pricePerColorPage != null ? (
                // Round 4: раздельная цена ч/б и цветных страниц
                <>
                  {(quote.bwPagesToPrint ?? 0) > 0 && (
                    <Row
                      label={`${quote.bwPagesToPrint} ч/б × ${formatMoney(quote.pricePerPage)}`}
                      value={formatMoney(quote.subtotalBw ?? 0)}
                    />
                  )}
                  {quote.colorPagesToPrint > 0 && (
                    <Row
                      label={`${quote.colorPagesToPrint} цветных × ${formatMoney(quote.pricePerColorPage)}`}
                      value={formatMoney(quote.subtotalColor ?? 0)}
                    />
                  )}
                  {quote.pagesToPrint === 0 && (
                    <Row label="Страницы не выбраны" value={formatMoney(0)} />
                  )}
                </>
              ) : (
                <Row
                  label={`${quote.pagesToPrint} стр. × ${formatMoney(quote.pricePerPage)}`}
                  value={formatMoney(quote.subtotal)}
                />
              )}
              <Row label={`Копий: ${quote.copies}`} value={`${quote.sheets} листов`} />
            </div>

            {quote.colorPagesToPrint > 0 && quote.pricePerColorPage != null && (
              <p className="flex items-start gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-2.5 text-xs text-fuchsia-800 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/30 dark:text-fuchsia-200">
                <Palette className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Цветные страницы печатаются в цвете — {formatMoney(quote.pricePerColorPage)} за страницу
                </span>
              </p>
            )}

            <div className="flex items-baseline justify-between gap-3 border-t border-stone-200 pt-3 dark:border-stone-700">
              <span className="text-sm text-stone-600 dark:text-stone-400">Итого</span>
              <motion.span
                key={quote.total}
                initial={{ opacity: 0.35, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="font-semibold text-3xl text-stone-900 dark:text-stone-50"
              >
                {formatMoney(quote.total)}
              </motion.span>
            </div>
          </>
        )}

        <p className="flex items-center gap-2 rounded-lg bg-stone-50 p-2.5 text-sm text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
          {isLoading && !quote ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-stone-400" aria-hidden="true" />
          ) : (
            <Banknote className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          Оплата при получении
        </p>
      </CardContent>
    </Card>
  );
}
