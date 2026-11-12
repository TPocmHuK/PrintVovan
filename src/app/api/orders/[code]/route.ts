import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettingsPublic } from '@/lib/settings';
import { apiError, mapTrackingOrder } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/orders/[code] — публичное отслеживание заказа по коду. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();
  const order = await db.order.findUnique({
    where: { code: normalized },
    include: {
      document: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) {
    return apiError('Заказ не найден', 404);
  }
  const settings = await getSettingsPublic();
  return NextResponse.json(
    mapTrackingOrder(order, {
      address: settings.pickupAddress,
      workingHours: settings.workingHours,
      readyEstimate: settings.readyEstimate,
    }),
  );
}
