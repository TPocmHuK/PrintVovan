'use client';

/**
 * PickupMap — карта расположения копи-центра на базе официального виджета
 * Яндекс Карт (https://yandex.ru/map-widget/v1/).
 *
 * Почему iframe-виджет вместо JS-библиотеки (Leaflet/MapLibre):
 *  - не требует API-ключа и не добавляет ни строчки JS в бандл;
 *  - знакомые клиентам российские карты; прямо из виджета можно построить
 *    маршрут до копи-центра;
 *  - нет никакой сторонней атрибуции на карте.
 *
 * Порядок координат в параметрах виджета — «долгота, широта» (ll/pt).
 * Смена точки меняет widgetUrl, а MapFrame смонтирован с key=widgetUrl —
 * React пересоздаёт его со свежим состоянием «loading» без эффектов-сбросов.
 * Если сеть недоступна/iframe заблокирован, показываем фолбэк со ссылкой
 * на Яндекс Карты.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_ZOOM = 17;
/** Сколько секунд ждём загрузку виджета, прежде чем показать фолбэк. */
const LOAD_TIMEOUT_MS = 8000;

export interface PickupMapProps {
  lat: number;
  lon: number;
  /** Начальный масштаб, по умолчанию 17. */
  zoom?: number;
  className?: string;
}

/** URL виджета Яндекс Карт: центр ll, метка pt (порядок — долгота, широта). */
function buildWidgetUrl(lat: number, lon: number, zoom: number): string {
  const lonText = lon.toFixed(6);
  const latText = lat.toFixed(6);
  const ll = encodeURIComponent(`${lonText},${latText}`);
  const pt = encodeURIComponent(`${lonText},${latText}`);
  return `https://yandex.ru/map-widget/v1/?ll=${ll}&z=${zoom}&pt=${pt}`;
}

/** Резервная ссылка на полноценные Яндекс Карты (та же точка). */
function buildMapsUrl(lat: number, lon: number, zoom: number): string {
  return `https://yandex.ru/maps/?pt=${lon.toFixed(6)}%2C${lat.toFixed(6)}&z=${zoom}&l=map`;
}

export function PickupMap({
  lat,
  lon,
  zoom = DEFAULT_ZOOM,
  className,
}: PickupMapProps) {
  const widgetUrl = buildWidgetUrl(lat, lon, zoom);
  return (
    <MapFrame
      key={widgetUrl}
      widgetUrl={widgetUrl}
      mapsUrl={buildMapsUrl(lat, lon, zoom)}
      className={className}
    />
  );
}

/** Один экземпляр виджета = одно состояние загрузки (ремоунт по key). */
function MapFrame({
  widgetUrl,
  mapsUrl,
  className,
}: {
  widgetUrl: string;
  mapsUrl: string;
  className?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  // Фолбэк: виджет не загрузился вовремя (сеть/блокировка iframe).
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = window.setTimeout(
      () => setStatus((current) => (current === 'loading' ? 'error' : current)),
      LOAD_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <div
      role="img"
      aria-label="Карта: расположение копи-центра"
      className={cn(
        'relative z-0 isolate h-64 w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:h-72 dark:border-stone-700 dark:bg-stone-800',
        className,
      )}
    >
      <iframe
        src={widgetUrl}
        title="Карта: расположение копи-центра (Яндекс Карты)"
        loading="lazy"
        allow="fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        className={cn(
          'absolute inset-0 size-full border-0 transition-opacity duration-300',
          status === 'ready' ? 'opacity-100' : 'opacity-0',
        )}
      />

      {status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-100 dark:bg-stone-800"
        >
          <Loader2 className="size-6 animate-spin text-stone-400" />
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Загружаем карту…
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-100 p-6 text-center dark:bg-stone-800">
          <MapPin className="size-8 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Карта недоступна в этом браузере
          </p>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              Открыть точку в Яндекс Картах
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
