import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import {
  apiError,
  DEFAULT_EVENT_MESSAGES,
  isOrderStatus,
  mapAdminOrder,
  readJson,
  STATUS_TRANSITIONS,
} from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Загружает заказ вместе с документом и событиями. */
function findOrderFull(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      document: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/** GET /api/admin/orders/[id] — заказ целиком (админ). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  const order = await findOrderFull(id);
  if (!order) {
    return apiError('Заказ не найден', 404);
  }
  return NextResponse.json(mapAdminOrder(order));
}

/**
 * PATCH /api/admin/orders/[id] — смена статуса заказа.
 * Тело: { status: OrderStatus, note?: string }. Переходы валидируются по контракту.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const body = await readJson(request);
  const status = body?.status;
  if (!isOrderStatus(status)) {
    return apiError('Недопустимый переход статуса', 400);
  }
  const note = typeof body?.note === 'string' ? body.note : undefined;

  const order = await findOrderFull(id);
  if (!order) {
    return apiError('Заказ не найден', 404);
  }
  const currentStatus = order.status;
  if (!isOrderStatus(currentStatus) || !STATUS_TRANSITIONS[currentStatus].includes(status)) {
    return apiError('Недопустимый переход статуса', 400);
  }

  const now = new Date();
  const data: {
    status: string;
    acceptedAt?: Date;
    readyAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
  } = { status };
  if (status === 'accepted') data.acceptedAt = now;
  if (status === 'ready') data.readyAt = now;
  if (status === 'completed') data.completedAt = now;
  if (status === 'cancelled') data.cancelledAt = now;

  const message =
    status === 'cancelled'
      ? note?.trim() || DEFAULT_EVENT_MESSAGES.cancelled
      : DEFAULT_EVENT_MESSAGES[status];

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data });
    await tx.orderEvent.create({ data: { orderId: id, status, message } });
  });

  const updated = await findOrderFull(id);
  if (!updated) {
    return apiError('Заказ не найден', 404);
  }
  return NextResponse.json(mapAdminOrder(updated));
}
