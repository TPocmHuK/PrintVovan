'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import { AdminView } from '@/components/printflow/admin-view';
import { AppFooter } from '@/components/printflow/footer';
import { AppHeader } from '@/components/printflow/header';
import { OrderWizard } from '@/components/printflow/order-wizard';
import { TrackingView } from '@/components/printflow/tracking-view';
import type { View } from '@/components/printflow/types';

const VALID_VIEWS: readonly View[] = ['order', 'track', 'admin'];

function readViewFromHash(): View | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  return (VALID_VIEWS as readonly string[]).includes(hash) ? (hash as View) : null;
}

export default function Home() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 5_000,
            retry: 1,
          },
        },
      }),
  );

  // Hydration-safe view state: initial (server + first client) render is always
  // 'order'; the URL hash is applied after mount and kept in sync.
  const [view, setView] = useState<View>('order');
  const [trackPrefill, setTrackPrefill] = useState<string | null>(null);

  useEffect(() => {
    const applyHash = () => setView(readViewFromHash() ?? 'order');
    const timer = window.setTimeout(applyHash, 0);
    window.addEventListener('hashchange', applyHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', applyHash);
    };
  }, []);

  function switchView(next: View) {
    setView(next);
    if (readViewFromHash() !== next) {
      // Triggers `hashchange`, which re-applies the same view (idempotent).
      window.location.hash = next;
    }
  }

  function handleTrackOrder(code: string) {
    setTrackPrefill(code);
    switchView('track');
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <AppHeader view={view} onViewChange={switchView} />
        <main className="flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8"
            >
              {view === 'order' && (
                <div className="mx-auto max-w-5xl">
                  <OrderWizard onTrackOrder={handleTrackOrder} />
                </div>
              )}
              {view === 'track' && (
                <TrackingView key={trackPrefill ?? 'track'} prefillCode={trackPrefill} />
              )}
              {view === 'admin' && <AdminView />}
            </motion.div>
          </AnimatePresence>
        </main>
        <AppFooter />
      </div>
    </QueryClientProvider>
  );
}
