import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { round2 } from '@/lib/pricing';
import { getSettings, getSettingsPublic, setSetting } from '@/lib/settings';
import { apiError, readJson } from '@/app/api/_lib/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIN_REGEX = /^\d{4,8}$/;
const MAP_LAT_ERROR_MESSAGE = 'Координаты карты указаны некорректно';

/**
 * Разбирает необязательную координату (число или числовая строка; пустая строка = не менять).
 * Возвращает null, если значение не передано; ok=false — невалидное значение.
 */
function parseOptionalCoordinate(
  raw: unknown,
  min: number,
  max: number,
): { ok: boolean; value: number | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === 'string' && raw.trim() === '') return { ok: true, value: null };
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) return { ok: false, value: null };
  return { ok: true, value: num };
}

/**
 * PUT /api/admin/settings — обновление настроек копи-центра.
 * Тело: { pricePerPage, pickupAddress, workingHours, readyEstimate, mapLat?, mapLon?, currentPin?, newPin? }.
 * Если передан newPin — проверяется currentPin, новый PIN должен быть 4–8 цифр.
 */
export async function PUT(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) {
    return apiError('Некорректные данные запроса', 400);
  }

  const pricePerPage =
    typeof body.pricePerPage === 'number' ? body.pricePerPage : Number(body.pricePerPage);
  if (!Number.isFinite(pricePerPage) || pricePerPage < 0.5 || pricePerPage > 1000) {
    return apiError('Цена за страницу: от 0.5 до 1000', 400);
  }

  const colorPricePerPage =
    typeof body.colorPricePerPage === 'number'
      ? body.colorPricePerPage
      : body.colorPricePerPage === undefined
        ? null
        : Number(body.colorPricePerPage);
  if (
    colorPricePerPage !== null &&
    (!Number.isFinite(colorPricePerPage) || colorPricePerPage < 0.5 || colorPricePerPage > 1000)
  ) {
    return apiError('Цена за цветную страницу: от 0.5 до 1000', 400);
  }

  const pickupAddress = typeof body.pickupAddress === 'string' ? body.pickupAddress.trim() : '';
  const workingHours = typeof body.workingHours === 'string' ? body.workingHours.trim() : '';
  const readyEstimate = typeof body.readyEstimate === 'string' ? body.readyEstimate.trim() : '';
  if (pickupAddress === '' || workingHours === '' || readyEstimate === '') {
    return apiError('Заполните все поля настроек', 400);
  }

  // Координаты карты: необязательные числа с проверкой диапазона.
  const lat = parseOptionalCoordinate(body.mapLat, -90, 90);
  if (!lat.ok) {
    return apiError(MAP_LAT_ERROR_MESSAGE, 400);
  }
  const lon = parseOptionalCoordinate(body.mapLon, -180, 180);
  if (!lon.ok) {
    return apiError(MAP_LAT_ERROR_MESSAGE, 400);
  }

  const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';
  if (newPin !== '') {
    const currentPin = typeof body.currentPin === 'string' ? body.currentPin.trim() : '';
    const settings = await getSettings();
    if (currentPin !== settings.adminPin) {
      return apiError('Неверный текущий PIN', 400);
    }
    if (!PIN_REGEX.test(newPin)) {
      return apiError('Новый PIN-код должен содержать от 4 до 8 цифр', 400);
    }
  }

  await setSetting('pricePerPage', String(round2(pricePerPage)));
  if (colorPricePerPage !== null) {
    await setSetting('colorPricePerPage', String(round2(colorPricePerPage)));
  }
  await setSetting('pickupAddress', pickupAddress);
  await setSetting('workingHours', workingHours);
  await setSetting('readyEstimate', readyEstimate);
  if (lat.value !== null) {
    await setSetting('mapLat', String(lat.value));
  }
  if (lon.value !== null) {
    await setSetting('mapLon', String(lon.value));
  }
  if (newPin !== '') {
    await setSetting('adminPin', newPin);
  }

  return NextResponse.json(await getSettingsPublic());
}
