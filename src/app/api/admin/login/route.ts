import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSetting } from '@/lib/settings';
import { apiError, readJson } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login — вход владельца по PIN.
 * Успех: генерирует токен, сохраняет в Setting adminToken, возвращает { token }.
 */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (pin === '') {
    return apiError('Неверный PIN-код', 401);
  }
  const settings = await getSettings();
  if (pin !== settings.adminPin) {
    return apiError('Неверный PIN-код', 401);
  }
  const token = randomBytes(24).toString('hex');
  await setSetting('adminToken', token);
  return NextResponse.json({ token });
}
