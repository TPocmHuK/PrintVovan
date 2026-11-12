'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCircle2, Copy, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import { formatMoney } from './format';
import type { OrderCreated } from './types';

export function SuccessStep({
  order,
  onTrack,
  onReset,
}: {
  order: OrderCreated;
  onTrack: () => void;
  onReset: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(order.code);
      setCopied(true);
      toast({ title: 'Код скопирован' });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({
        title: 'Не удалось скопировать',
        description: 'Скопируйте код вручную',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-4 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-950"
      >
        <CheckCircle2
          className="size-10 text-emerald-600"
          aria-hidden="true"
        />
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Заказ оформлен!
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Назовите этот код сотруднику при получении заказа
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <span className="font-mono text-4xl font-bold tracking-[0.12em] text-stone-900 dark:text-stone-50">
          {order.code}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Скопировать код заказа"
          onClick={copyCode}
          className="size-11 shrink-0"
        >
          {copied ? (
            <Check className="size-5 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="size-5" aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-sm dark:border-stone-800 dark:bg-stone-900/60">
        <p className="text-stone-600 dark:text-stone-400">
          {order.pagesToPrint} стр. × {order.copies} экз. ={' '}
          {order.pagesToPrint * order.copies} листов
        </p>
        {(order.colorPagesToPrint ?? 0) > 0 && (
          <p className="text-stone-600 dark:text-stone-400">
            В том числе цветных: {order.colorPagesToPrint} — напечатаем в цвете
          </p>
        )}
        <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
          К оплате: {formatMoney(order.totalPrice)}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Оплата при получении
        </p>
        <p className="flex items-start justify-center gap-1.5 pt-1 text-xs text-stone-500 dark:text-stone-400">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {order.pickupAddress} · {order.readyEstimate}
          </span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" size="lg" className="h-12 text-base" onClick={onTrack}>
          Отследить заказ
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 text-base"
          onClick={onReset}
        >
          Новый заказ
        </Button>
      </div>
    </div>
  );
}
