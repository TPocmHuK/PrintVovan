import { db } from '@/lib/db';
import { round2 } from '@/lib/pricing';

/** Ключи настроек копи-центра (таблица Setting, key/value — строки). */
export type SettingKey =
  | 'pricePerPage'
  | 'colorPricePerPage'
  | 'pickupAddress'
  | 'workingHours'
  | 'readyEstimate'
  | 'mapLat'
  | 'mapLon'
  | 'adminPin'
  | 'adminToken';

/** Координаты карты по умолчанию (пер. Тихий, д. 1, с. Татарская Башмаковка). */
export const MAP_DEFAULT_LAT = 46.2494836;
export const MAP_DEFAULT_LON = 47.9870875;

/** Значения по умолчанию — лениво создаются при первом чтении (upsert). */
const DEFAULT_SETTINGS: Record<SettingKey, string> = {
  pricePerPage: '3',
  colorPricePerPage: '10',
  pickupAddress: 'Астраханская область, село Татарская Башмаковка, переулок Тихий, дом 1',
  workingHours: 'Пн–Пт: 9:00–19:00 · Сб: 10:00–16:00 · Вс: выходной',
  readyEstimate: 'Обычно заказ готов в течение 2 часов в рабочее время',
  mapLat: String(MAP_DEFAULT_LAT),
  mapLon: String(MAP_DEFAULT_LON),
  adminPin: '1234',
  adminToken: '',
};

/** Публичные настройки (без PIN и админ-токена). */
export interface SettingsPublic {
  pricePerPage: number;
  colorPricePerPage: number;
  pickupAddress: string;
  workingHours: string;
  readyEstimate: string;
  mapLat: number;
  mapLon: number;
}

/**
 * Возвращает все настройки копи-центра.
 * Отсутствующие ключи лениво создаются со значениями по умолчанию (upsert).
 */
export async function getSettings(): Promise<Record<SettingKey, string>> {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const values = new Map<string, string>(rows.map((row) => [row.key, row.value]));
  const missing = keys.filter((key) => !values.has(key));
  if (missing.length > 0) {
    await Promise.all(
      missing.map((key) =>
        db.setting.upsert({
          where: { key },
          update: {},
          create: { key, value: DEFAULT_SETTINGS[key] },
        }),
      ),
    );
    for (const key of missing) values.set(key, DEFAULT_SETTINGS[key]);
  }
  const result = {} as Record<SettingKey, string>;
  for (const key of keys) result[key] = values.get(key) ?? DEFAULT_SETTINGS[key];
  return result;
}

/** Разбирает строковое значение координаты; при ошибке — значение по умолчанию. */
function parseCoordinate(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Публичные настройки для клиента; цены и координаты карты приводятся к числу. */
export async function getSettingsPublic(): Promise<SettingsPublic> {
  const settings = await getSettings();
  const price = Number(settings.pricePerPage);
  const colorPrice = Number(settings.colorPricePerPage);
  return {
    pricePerPage:
      Number.isFinite(price) && price > 0 ? round2(price) : Number(DEFAULT_SETTINGS.pricePerPage),
    colorPricePerPage:
      Number.isFinite(colorPrice) && colorPrice > 0
        ? round2(colorPrice)
        : Number(DEFAULT_SETTINGS.colorPricePerPage),
    pickupAddress: settings.pickupAddress,
    workingHours: settings.workingHours,
    readyEstimate: settings.readyEstimate,
    mapLat: parseCoordinate(settings.mapLat, MAP_DEFAULT_LAT),
    mapLon: parseCoordinate(settings.mapLon, MAP_DEFAULT_LON),
  };
}

/** Сохраняет значение настройки (upsert по ключу). */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
