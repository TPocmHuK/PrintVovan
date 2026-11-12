'use client';

import { useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Check,
  CheckCheck,
  Copy,
  Download,
  FileStack,
  FileText,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Palette,
  Phone,
  Printer,
  Scissors,
  Settings2,
  User,
  type LucideIcon,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import * as api from './api';
import {
  ApiError,
  clearAdminToken,
  errorMessage,
  formatRangeLabel,
  readAdminToken,
  setAdminToken,
  subscribeAdminToken,
  type DownloadVariant,
} from './api';
import { AdminSettingsForm } from './admin-settings';
import { formatDateTime, formatMoney, uploadFormatLabel } from './format';
import { useAdminOrders, useSettings } from './hooks';
import { ORDER_STATUSES, ORDER_STATUS_META, StatusBadge } from './status-meta';
import type { AdminOrder, OrderStatus, PatchOrderPayload } from './types';

const PRIMARY_ACTION: Partial<
  Record<OrderStatus, { to: OrderStatus; label: string; icon: LucideIcon }>
> = {
  pending: { to: 'accepted', label: 'Принять', icon: Check },
  accepted: { to: 'printing', label: 'Начать печать', icon: Printer },
  printing: { to: 'ready', label: 'Готов к выдаче', icon: PackageCheck },
  ready: { to: 'completed', label: 'Выдан', icon: CheckCheck },
};

const CANCELLABLE: OrderStatus[] = ['pending', 'accepted', 'printing', 'ready'];

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-stone-200 shadow-sm dark:border-stone-800">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
            {label}
          </p>
          <p className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        active
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs leading-5',
          active
            ? 'bg-white/20 text-white'
            : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AdminOrderCard({
  order,
  busy,
  downloading,
  onStatusChange,
  onCancelRequest,
  onDownload,
}: {
  order: AdminOrder;
  busy: boolean;
  /** Which download is in flight for THIS order, if any. */
  downloading: DownloadVariant | null;
  onStatusChange: (status: OrderStatus) => void;
  onCancelRequest: () => void;
  onDownload: (variant: DownloadVariant) => void;
}) {
  const primary = PRIMARY_ACTION[order.status] ?? null;
  const canCancel = CANCELLABLE.includes(order.status);

  // Round 2: format badge — old servers omit fileFormat, treat as 'pdf'.
  // The original-file download exists only for DOC/DOCX uploads.
  const fileFormat = (order.document.fileFormat ?? 'pdf').toLowerCase();
  const hasOriginal = Boolean(order.document.fileFormat) && fileFormat !== 'pdf';

  return (
    <Card className="border-stone-200 shadow-sm dark:border-stone-800">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-base font-bold text-stone-900 dark:text-stone-50">
            {order.code}
          </span>
          <StatusBadge status={order.status} />
          <time
            dateTime={order.createdAt}
            className="ml-auto text-xs text-stone-500 dark:text-stone-400"
          >
            {formatDateTime(order.createdAt)}
          </time>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5 text-stone-800 dark:text-stone-200">
            <User className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            {order.customerName}
          </span>
          <a
            href={`tel:${order.customerPhone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400"
          >
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            {order.customerPhone}
          </a>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600 dark:text-stone-400">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <FileText className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            <span className="max-w-52 truncate" title={order.document.fileName}>
              {order.document.fileName}
            </span>
            <Badge
              variant="outline"
              className="border-stone-200 bg-stone-100 px-1.5 text-[10px] font-semibold tracking-wide text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
            >
              {uploadFormatLabel(fileFormat)}
            </Badge>
            <span>
              · {order.document.totalPages ?? '—'} стр.
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Scissors className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            {formatRangeLabel(order.pageRangeText)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Copy className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            ×{order.copies} экз. · {order.pagesToPrint * order.copies} листов
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Palette className="size-4 shrink-0 text-fuchsia-400" aria-hidden="true" />
            {order.colorPagesToPrint} цветных
            {order.bwPagesToPrint != null ? ` · ${order.bwPagesToPrint} ч/б` : ''}
          </span>
        </div>

        {order.comment && (
          <p className="flex items-start gap-1.5 text-sm italic text-stone-500 dark:text-stone-400">
            <MessageSquare
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            {order.comment}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3 dark:border-stone-700">
          <div className="flex flex-wrap items-center gap-2">
            {primary && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                disabled={busy}
                onClick={() => onStatusChange(primary.to)}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <primary.icon className="size-4" aria-hidden="true" />
                )}
                {primary.label}
              </Button>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                disabled={busy}
                onClick={onCancelRequest}
              >
                Отменить
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
              onClick={() => onDownload('print')}
              disabled={downloading !== null}
              aria-label={`Скачать файл печати (PDF) заказа ${order.code}`}
            >
              {downloading === 'print' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              Файл печати (PDF)
            </Button>
            {hasOriginal && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                onClick={() => onDownload('original')}
                disabled={downloading !== null}
                title="Оригинал (исходный файл без конвертации)"
                aria-label={`Скачать оригинал (${uploadFormatLabel(fileFormat)}) заказа ${order.code}`}
              >
                {downloading === 'original' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
          <span className="text-lg font-bold text-stone-900 dark:text-stone-50">
            {formatMoney(order.totalPrice)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Hydration-safe: token is read from an external store (localStorage),
  // server snapshot is always null.
  const token = useSyncExternalStore(
    subscribeAdminToken,
    readAdminToken,
    () => null,
  );

  const [pin, setPin] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [cancelTarget, setCancelTarget] = useState<AdminOrder | null>(null);
  const [cancelNote, setCancelNote] = useState('');

  function handleUnauthorized() {
    clearAdminToken();
    toast({
      title: 'Сессия истекла',
      description: 'Войдите заново',
      variant: 'destructive',
    });
  }

  function handleAdminError(error: unknown, fallbackTitle: string) {
    if (error instanceof ApiError && error.status === 401) {
      handleUnauthorized();
      return;
    }
    toast({
      title: fallbackTitle,
      description: errorMessage(error),
      variant: 'destructive',
    });
  }

  const loginMutation = useMutation({
    mutationFn: () => api.adminLogin(pin.trim()),
    onSuccess: (res) => {
      setAdminToken(res.token);
      setPin('');
      toast({ title: 'Добро пожаловать!' });
    },
    onError: () => {
      // Wrong PIN returns 401 — the inline block below shows the server message
      // (this is not a session expiry, so we do not log out).
    },
  });

  const ordersQuery = useAdminOrders(Boolean(token), handleUnauthorized);

  const patchMutation = useMutation({
    mutationFn: ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: PatchOrderPayload;
    }) => api.patchAdminOrder(orderId, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setCancelTarget(null);
      setCancelNote('');
      toast({
        title: `Статус обновлён: ${ORDER_STATUS_META[updated.status].label}`,
      });
    },
    onError: (error) => handleAdminError(error, 'Не удалось обновить статус'),
  });

  const downloadMutation = useMutation({
    mutationFn: ({
      orderId,
      fileName,
      variant,
    }: {
      orderId: string;
      fileName: string;
      variant: DownloadVariant;
    }) => api.downloadAdminOrderFile(orderId, fileName, variant),
    onSuccess: (_result, variables) => {
      toast({
        title:
          variables.variant === 'original'
            ? 'Оригинал загружен'
            : 'Файл печати загружен',
      });
    },
    onError: (error) => handleAdminError(error, 'Не удалось скачать файл'),
  });

  const settingsQuery = useSettings();

  const orders = ordersQuery.data?.orders ?? [];
  const stats = ordersQuery.data?.stats ?? {
    todayCount: 0,
    activeCount: 0,
    readyCount: 0,
    queueSheets: 0,
    revenueToday: 0,
  };
  const filteredOrders =
    statusFilter === 'all'
      ? orders
      : orders.filter((order) => order.status === statusFilter);
  const patchingOrderId =
    patchMutation.isPending && patchMutation.variables
      ? patchMutation.variables.orderId
      : null;
  const downloadingOrderId =
    downloadMutation.isPending && downloadMutation.variables
      ? downloadMutation.variables.orderId
      : null;
  const downloadingVariant: DownloadVariant | null =
    downloadMutation.isPending && downloadMutation.variables
      ? downloadMutation.variables.variant
      : null;

  /* ------------------------------- Login ------------------------------- */
  if (!token) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col justify-center py-6 sm:py-10">
        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardContent className="p-6">
            <div className="mb-5 flex flex-col items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <KeyRound className="size-7" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-stone-900 dark:text-stone-50">
                  Панель владельца
                </h1>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Введите PIN-код доступа
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (pin.trim()) loginMutation.mutate();
              }}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="pf-admin-pin">PIN-код</Label>
                <Input
                  id="pf-admin-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 8))
                  }
                  className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                  aria-describedby="pf-admin-hint"
                  autoFocus
                />
              </div>
              {loginMutation.isError && (
                <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                  {errorMessage(loginMutation.error)}
                </p>
              )}
              <Button
                type="submit"
                className="h-12 w-full text-base"
                disabled={pin.trim().length === 0 || loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                Войти
              </Button>
              <p
                id="pf-admin-hint"
                className="text-center text-xs text-stone-400 dark:text-stone-500"
              >
                PIN по умолчанию: 1234 — смените его в настройках
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------ Logged in ---------------------------- */
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            Панель владельца
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Управление заказами копи-центра
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            clearAdminToken();
            toast({ title: 'Вы вышли из панели' });
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Выйти
        </Button>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="h-11 w-full grid grid-cols-2 sm:w-80">
          <TabsTrigger value="orders" className="gap-1.5">
            <Inbox className="size-4" aria-hidden="true" />
            Заказы
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="size-4" aria-hidden="true" />
            Настройки
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ Orders --------------------------- */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              icon={Inbox}
              label="Сегодня заказов"
              value={String(stats.todayCount)}
            />
            <StatCard
              icon={Printer}
              label="В работе"
              value={String(stats.activeCount)}
            />
            <StatCard
              icon={FileStack}
              label="Листов в очереди"
              value={String(stats.queueSheets)}
            />
            <StatCard
              icon={Banknote}
              label="Выручка сегодня"
              value={formatMoney(stats.revenueToday)}
            />
          </div>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Фильтр заказов по статусу"
          >
            <FilterChip
              active={statusFilter === 'all'}
              label="Все"
              count={orders.length}
              onClick={() => setStatusFilter('all')}
            />
            {ORDER_STATUSES.map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                label={ORDER_STATUS_META[status].shortLabel}
                count={orders.filter((order) => order.status === status).length}
                onClick={() => setStatusFilter(status)}
              />
            ))}
          </div>

          {ordersQuery.isPending && (
            <div className="space-y-4" role="status" aria-label="Загрузка заказов">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="border-stone-200 dark:border-stone-800">
                  <CardContent className="space-y-3 p-4">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {ordersQuery.error && !ordersQuery.isPending && (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
            >
              <AlertTitle>Не удалось загрузить заказы</AlertTitle>
              <AlertDescription>{errorMessage(ordersQuery.error)}</AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-11 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:bg-transparent"
                onClick={() => ordersQuery.refetch()}
              >
                Повторить
              </Button>
            </Alert>
          )}

          {!ordersQuery.isPending && !ordersQuery.error && filteredOrders.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700">
              <span className="grid size-14 place-items-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
                <PackageOpen className="size-7" aria-hidden="true" />
              </span>
              <p className="font-medium text-stone-900 dark:text-stone-100">
                Заказов пока нет
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Новые заказы появятся здесь автоматически
              </p>
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div className="pf-scrollbar max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {filteredOrders.map((order) => (
                <AdminOrderCard
                  key={order.id}
                  order={order}
                  busy={patchingOrderId === order.id}
                  downloading={
                    downloadingOrderId === order.id ? downloadingVariant : null
                  }
                  onStatusChange={(status) =>
                    patchMutation.mutate({ orderId: order.id, payload: { status } })
                  }
                  onCancelRequest={() => {
                    setCancelNote('');
                    setCancelTarget(order);
                  }}
                  onDownload={(variant) =>
                    downloadMutation.mutate({
                      orderId: order.id,
                      fileName: order.document.fileName,
                      variant,
                    })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- Settings -------------------------- */}
        <TabsContent value="settings" className="mt-4">
          {settingsQuery.isPending && (
            <Card className="border-stone-200 dark:border-stone-800">
              <CardContent className="space-y-4 p-6" role="status" aria-label="Загрузка настроек">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-40" />
              </CardContent>
            </Card>
          )}

          {settingsQuery.error && !settingsQuery.isPending && (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
            >
              <AlertTitle>Не удалось загрузить настройки</AlertTitle>
              <AlertDescription>
                {errorMessage(settingsQuery.error)}
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-11 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:bg-transparent"
                onClick={() => settingsQuery.refetch()}
              >
                Повторить
              </Button>
            </Alert>
          )}

          {settingsQuery.data && (
            <AdminSettingsForm
              key={`settings-${settingsQuery.dataUpdatedAt}`}
              initialSettings={settingsQuery.data}
              onError={handleAdminError}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel dialog */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelNote('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Отменить заказ {cancelTarget?.code}?
            </DialogTitle>
            <DialogDescription>
              Укажите причину (необязательно) — она появится в истории заказа.
              Отменить заказ клиенту будет нельзя.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelNote}
            onChange={(event) => setCancelNote(event.target.value.slice(0, 500))}
            placeholder="Например: не удалось связаться с клиентом"
            rows={3}
            maxLength={500}
            aria-label="Причина отмены"
          />
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setCancelTarget(null);
                setCancelNote('');
              }}
              disabled={patchMutation.isPending}
            >
              Вернуться
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={patchMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                patchMutation.mutate({
                  orderId: cancelTarget.id,
                  payload: {
                    status: 'cancelled',
                    note: cancelNote.trim() || undefined,
                  },
                });
              }}
            >
              {patchMutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Отменить заказ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
