'use client';

/**
 * Single source of truth for order/analysis status presentation:
 * RU labels, badge color classes (bg-100/text-700 + dot) and lucide icons.
 */
import {
  CheckCheck,
  CheckCircle2,
  Clock,
  FileClock,
  Loader2,
  PackageCheck,
  Printer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import type { AnalysisStatus, OrderStatus } from './types';

export interface OrderStatusMeta {
  label: string;
  /** Short label for compact chips/filters. */
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
  icon: LucideIcon;
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  pending: {
    label: 'Новый',
    shortLabel: 'Новый',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
    icon: Clock,
  },
  accepted: {
    label: 'Принят',
    shortLabel: 'Принят',
    badgeClass: 'bg-violet-100 text-violet-700 border-violet-200',
    dotClass: 'bg-violet-500',
    icon: CheckCircle2,
  },
  printing: {
    label: 'Печать',
    shortLabel: 'Печать',
    badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
    dotClass: 'bg-orange-500',
    icon: Printer,
  },
  ready: {
    label: 'Готов к выдаче',
    shortLabel: 'Готов',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: PackageCheck,
  },
  completed: {
    label: 'Выдан',
    shortLabel: 'Выдан',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
    dotClass: 'bg-stone-500',
    icon: CheckCheck,
  },
  cancelled: {
    label: 'Отменён',
    shortLabel: 'Отменён',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
    icon: XCircle,
  },
};

/** Display order for filters and lists. */
export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'accepted',
  'printing',
  'ready',
  'completed',
  'cancelled',
];

export function StatusBadge({
  status,
  className = '',
}: {
  status: OrderStatus;
  className?: string;
}) {
  const meta = ORDER_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass} ${className}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export interface AnalysisStatusMeta {
  label: string;
  icon: LucideIcon;
  spin?: boolean;
}

export const ANALYSIS_STATUS_META: Record<AnalysisStatus, AnalysisStatusMeta> =
  {
    queued: { label: 'В очереди на анализ', icon: FileClock },
    converting: { label: 'Преобразуем в PDF', icon: Loader2, spin: true },
    analyzing: { label: 'Анализируется', icon: Loader2, spin: true },
    analyzed: { label: 'Проанализирован', icon: CheckCircle2 },
    failed: { label: 'Ошибка анализа', icon: XCircle },
  };
