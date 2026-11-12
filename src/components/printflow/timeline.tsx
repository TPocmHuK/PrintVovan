'use client';

import { cn } from '@/lib/utils';
import { formatDateTime } from './format';
import { ORDER_STATUS_META } from './status-meta';
import type { TimelineEvent } from './types';

/**
 * Vertical event timeline, newest first, RU dates («05.02, 14:30»).
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-stone-500">Событий пока нет</p>;
  }

  return (
    <ol className="space-y-5" aria-label="История заказа">
      {sorted.map((event, index) => {
        const meta = ORDER_STATUS_META[event.status];
        const Icon = meta.icon;
        const isLast = index === sorted.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'z-10 grid size-9 shrink-0 place-items-center rounded-full border',
                meta.badgeClass,
              )}
            >
              <Icon className="size-4" />
            </span>
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[17px] top-9 h-[calc(100%-1.5rem)] w-px bg-stone-200 dark:bg-stone-700"
              />
            )}
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {meta.label}
                </span>
                <time
                  dateTime={event.createdAt}
                  className="text-xs text-stone-500 dark:text-stone-400"
                >
                  {formatDateTime(event.createdAt)}
                </time>
              </div>
              {event.message && (
                <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                  {event.message}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
