import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';

/**
 * Проверяет админ-токен из заголовка `x-admin-token` против Setting adminToken.
 * Возвращает NextResponse со статусом 401, если доступ запрещён,
 * иначе null (доступ разрешён).
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const token = (request.headers.get('x-admin-token') ?? '').trim();
  if (token === '') {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
  }
  const settings = await getSettings();
  const validToken = settings.adminToken.trim();
  if (validToken === '' || token !== validToken) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
  }
  return null;
}
