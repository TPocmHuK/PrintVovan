import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { mapAdminOrder } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['pending', 'accepted', 'printing'];

/** GET /api/admin/orders — все заказы (новые сверху) + статистика панели. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      document: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let todayCount = 0;
  let activeCount = 0;
  let readyCount = 0;
  let queueSheets = 0;
  let revenueToday = 0;

  for (const order of orders) {
    if (order.createdAt >= startOfToday) todayCount += 1;
    if (ACTIVE_STATUSES.includes(order.status)) {
      activeCount += 1;
      queueSheets += order.pagesToPrint * order.copies;
    }
    if (order.status === 'ready') readyCount += 1;
    if (
      order.status === 'completed' &&
      order.completedAt &&
      order.completedAt >= startOfToday
    ) {
      revenueToday += order.totalPrice;
    }
  }

  return NextResponse.json({
    orders: orders.map(mapAdminOrder),
    stats: {
      todayCount,
      activeCount,
      readyCount,
      queueSheets,
      revenueToday: Math.round(revenueToday * 100) / 100,
    },
  });
}
