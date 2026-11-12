'use client';

import { FilePlus2, KeyRound, Moon, Printer, Search, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';
import type { View } from './types';

const NAV_ITEMS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'order', label: 'Заказать', icon: FilePlus2 },
  { id: 'track', label: 'Отследить', icon: Search },
  { id: 'admin', label: 'Владельцу', icon: KeyRound },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="size-11 shrink-0 rounded-full border-stone-200 bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 sm:size-10 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="block size-4 dark:hidden" aria-hidden="true" />
    </Button>
  );
}

export function AppHeader({
  view,
  onViewChange,
}: {
  view: View;
  onViewChange: (view: View) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/80 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4">
        <button
          type="button"
          onClick={() => onViewChange('order')}
          aria-label="PrintFlow — перейти к оформлению заказа"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Printer className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            PrintFlow
          </span>
          <span className="hidden rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 md:inline-flex dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
            А4 · ч/б и цвет
          </span>
        </button>

        <div className="flex items-center gap-2">
          <nav
            aria-label="Разделы сайта"
            className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-900"
          >
            {NAV_ITEMS.map((item) => {
              const active = view === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:h-9',
                    active
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sr-only sm:hidden">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
