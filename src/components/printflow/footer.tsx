'use client';

import { Banknote, Clock, MapPin } from 'lucide-react';

import { formatMoney } from './format';
import { useSettings } from './hooks';
import { DEFAULT_SETTINGS, resolveColorPrice } from './types';

export function AppFooter() {
  const { data } = useSettings();
  const settings = data ?? DEFAULT_SETTINGS;

  return (
    <footer className="mt-auto border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-sm text-stone-600 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:text-left dark:text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{settings.pickupAddress}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{settings.workingHours}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Banknote className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            {formatMoney(settings.pricePerPage)}/стр ч/б ·{' '}
            {formatMoney(resolveColorPrice(settings))}/стр цветная · оплата при
            получении
          </span>
        </span>
      </div>
    </footer>
  );
}
