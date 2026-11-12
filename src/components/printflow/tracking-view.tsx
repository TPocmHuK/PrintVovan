'use client';

import { useState } from 'react';
import {
  Clock,
  FileSearch,
  FileText,
  MapPin,
  Printer,
  Scissors,
  Search,
  Timer,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

import { ApiError, errorMessage, formatRangeLabel } from './api';
import { formatDateTime, formatMoney } from './format';
import { useSettings, useTrackingOrder } from './hooks';
import { PickupMap } from './pickup-map';
import { StatusBadge } from './status-meta';
import { Timeline } from './timeline';
import { resolveMapCoords } from './types';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/60">
      <dt className="text-xs text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-stone-900 dark:text-stone-100">
        {value}
      </dd>
    </div>
  );
}

export function TrackingView({ prefillCode }: { prefillCode: string | null }) {
  const [input, setInput] = useState(prefillCode ?? '');
  const [code, setCode] = useState<string | null>(prefillCode ?? null);

  const query = useTrackingOrder(code);
  const order = query.data ?? null;
  const isNotFound = query.error instanceof ApiError && query.error.status === 404;

  // Map coordinates come from the shop settings (one copy-center);
  // resolveMapCoords falls back to defaults while loading / on old servers.
  const settingsQuery = useSettings();
  const { lat, lon } = resolveMapCoords(settingsQuery.data);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = input.trim().toUpperCase();
    setCode(normalized || null);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Отследить заказ
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Введите код заказа, который вы получили при оформлении
        </p>
      </div>

      <Card className="border-stone-200 shadow-sm dark:border-stone-800">
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="pf-track-code">Код заказа</Label>
              <Input
                id="pf-track-code"
                value={input}
                onChange={(event) => setInput(event.target.value.toUpperCase())}
                placeholder="PF-XXXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                className="h-12 font-mono text-lg tracking-[0.12em] uppercase"
                aria-describedby="pf-track-hint"
              />
              <p id="pf-track-hint" className="text-xs text-stone-500 dark:text-stone-400">
                Код выглядит так: PF-A1B2C3
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 px-6 text-base"
              disabled={input.trim().length === 0}
            >
              <Search className="size-4" aria-hidden="true" />
              Найти
            </Button>
          </form>
        </CardContent>
      </Card>

      {!code && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700">
          <span className="grid size-14 place-items-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
            <FileSearch className="size-7" aria-hidden="true" />
          </span>
          <p className="font-medium text-stone-900 dark:text-stone-100">
            Заказ ещё не найден
          </p>
          <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
            Введите код заказа выше — статус, история и информация о выдаче появятся
            здесь.
          </p>
        </div>
      )}

      {code && query.isPending && (
        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardContent className="space-y-4 p-4 sm:p-6" role="status" aria-label="Загрузка заказа">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-6 w-28" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {code && query.error && !query.isPending && (
        <div className="space-y-4">
          {isNotFound ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700">
              <span className="grid size-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <FileSearch className="size-7" aria-hidden="true" />
              </span>
              <p className="font-medium text-stone-900 dark:text-stone-100">
                Заказ не найден — проверьте код
              </p>
              <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
                Возможно, в коде опечатка. Проверьте буквы и цифры и попробуйте
                ещё раз.
              </p>
            </div>
          ) : (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
            >
              <AlertTitle>Не удалось загрузить заказ</AlertTitle>
              <AlertDescription>{errorMessage(query.error)}</AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-11 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:bg-transparent"
                onClick={() => query.refetch()}
              >
                Повторить
              </Button>
            </Alert>
          )}
        </div>
      )}

      {order && (
        <div className="space-y-6">
          <Card className="border-stone-200 shadow-sm dark:border-stone-800">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="font-mono text-xl font-bold tracking-wide text-stone-900 dark:text-stone-50">
                  Заказ {order.code}
                </CardTitle>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Создан: {formatDateTime(order.createdAt)} · {order.customerName}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile
                  label="Файл"
                  value={order.document.fileName || '—'}
                />
                <StatTile
                  label="Страницы"
                  value={`${order.pagesToPrint} стр. (${order.colorPagesToPrint} цветных)`}
                />
                <StatTile label="Копии" value={`${order.copies} экз.`} />
                <StatTile
                  label="Листов"
                  value={`${order.pagesToPrint * order.copies}`}
                />
                <StatTile
                  label="Диапазон"
                  value={formatRangeLabel(order.pageRangeText)}
                />
                <StatTile label="Сумма" value={formatMoney(order.totalPrice)} />
              </dl>

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
                  {order.document.totalPages ?? '—'} стр. в документе
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Scissors className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
                  {formatRangeLabel(order.pageRangeText)}
                </span>
              </div>

              <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                  <Printer className="size-4 text-emerald-600" aria-hidden="true" />
                  История заказа
                  <span className="sr-only sm:inline">
                    (обновляется автоматически)
                  </span>
                </h3>
                <Timeline events={order.events} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-stone-50/60 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4 text-emerald-600" aria-hidden="true" />
                Самовывоз
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
                <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
                <span>{order.pickup.address}</span>
              </p>
              <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
                <Clock className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
                <span>{order.pickup.workingHours}</span>
              </p>
              <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
                <Timer className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
                <span>{order.pickup.readyEstimate}</span>
              </p>
              <div className="pt-2">
                <PickupMap lat={lat} lon={lon} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
