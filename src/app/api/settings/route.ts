import { NextResponse } from 'next/server';
import { ensureUploadRoute } from '@/app/api/_lib/shared';
import { getSettingsPublic } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/settings — публичные настройки копи-центра.
 *  Заодно — самая частая точка самолечения upload-роута (см. ensureUploadRoute):
 *  вызывается клиентом на каждой загрузке страницы, до выбора файла. */
export async function GET() {
  ensureUploadRoute();
  return NextResponse.json(await getSettingsPublic());
}
