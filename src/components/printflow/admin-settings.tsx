'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  KeyRound,
  Loader2,
  Save,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import * as api from './api';
import { formatCoord, parseCoord } from './format';
import { PickupMap } from './pickup-map';
import {
  DEFAULT_MAP_LAT,
  DEFAULT_MAP_LON,
  resolveMapCoords,
  type SettingsPublic,
} from './types';

const PIN_PATTERN = /^\d{4,8}$/;
const MAP_COORD_ERROR = 'Координаты карты указаны некорректно';

export function AdminSettingsForm({
  initialSettings,
  onError,
}: {
  initialSettings: SettingsPublic;
  /** Parent-level error handler (401 → logout, others → toast). */
  onError: (error: unknown, fallbackTitle: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [price, setPrice] = useState(String(initialSettings.pricePerPage));
  const [colorPrice, setColorPrice] = useState(
    String(initialSettings.colorPricePerPage ?? 10),
  );
  const [address, setAddress] = useState(initialSettings.pickupAddress);
  const [hours, setHours] = useState(initialSettings.workingHours);
  const [estimate, setEstimate] = useState(initialSettings.readyEstimate);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Pickup map: the iframe preview follows the coordinate inputs. The parent
  // remounts this form (keyed by dataUpdatedAt) when settings load/refetch,
  // so initial state is fresh.
  const initialCoords = resolveMapCoords(initialSettings);
  const [mapCoords, setMapCoords] = useState(initialCoords);
  const [latText, setLatText] = useState(formatCoord(initialCoords.lat));
  const [lonText, setLonText] = useState(formatCoord(initialCoords.lon));
  const [mapError, setMapError] = useState<string | null>(null);

  const priceNumber = Number.parseFloat(price.replace(',', '.'));
  const priceValid =
    Number.isFinite(priceNumber) && priceNumber >= 0.5 && priceNumber <= 1000;
  const colorPriceNumber = Number.parseFloat(colorPrice.replace(',', '.'));
  const colorPriceValid =
    Number.isFinite(colorPriceNumber) && colorPriceNumber >= 0.5 && colorPriceNumber <= 1000;

  /* ------------------- Inputs → map preview sync ------------------- */

  /** Inputs (on blur) → move the marker. Invalid values keep the old pin. */
  function commitCoordsFromInputs() {
    const lat = parseCoord(latText, 90);
    const lon = parseCoord(lonText, 180);
    if (lat === null || lon === null) {
      setMapError(MAP_COORD_ERROR);
      return;
    }
    setMapCoords({ lat, lon });
    setLatText(formatCoord(lat));
    setLonText(formatCoord(lon));
    setMapError(null);
  }

  /** Coordinates as they will be saved (null when invalid). */
  function coordsForSave(): { mapLat: number; mapLon: number } | null {
    const lat = parseCoord(latText, 90);
    const lon = parseCoord(lonText, 180);
    return lat === null || lon === null ? null : { mapLat: lat, mapLon: lon };
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateAdminSettings({
        pricePerPage: Math.round(priceNumber * 100) / 100,
        colorPricePerPage: Math.round(colorPriceNumber * 100) / 100,
        pickupAddress: address.trim(),
        workingHours: hours.trim(),
        readyEstimate: estimate.trim(),
        // Round 2: save the map position together with the other fields.
        mapLat: mapCoords.lat,
        mapLon: mapCoords.lon,
      }),
    onSuccess: () => {
      toast({ title: 'Настройки сохранены' });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => onError(error, 'Не удалось сохранить настройки'),
  });

  const pinMutation = useMutation({
    mutationFn: () =>
      api.updateAdminSettings({
        pricePerPage: initialSettings.pricePerPage,
        colorPricePerPage: initialSettings.colorPricePerPage ?? 10,
        pickupAddress: initialSettings.pickupAddress,
        workingHours: initialSettings.workingHours,
        readyEstimate: initialSettings.readyEstimate,
        // Preserve the stored map position when only the PIN changes.
        mapLat: initialCoords.lat,
        mapLon: initialCoords.lon,
        currentPin: currentPin,
        newPin: newPin,
      }),
    onSuccess: () => {
      toast({ title: 'PIN-код изменён' });
      setCurrentPin('');
      setNewPin('');
      setPinError(null);
      setPinOpen(false);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      setPinError(api.errorMessage(error));
      onError(error, 'Не удалось изменить PIN');
    },
  });

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!priceValid) {
      setPriceError('Цена за страницу: от 0.5 до 1000');
      return;
    }
    if (!colorPriceValid) {
      setPriceError('Цена за цветную страницу: от 0.5 до 1000');
      return;
    }
    setPriceError(null);
    if (!coordsForSave()) {
      setMapError(MAP_COORD_ERROR);
      return;
    }
    setMapError(null);
    saveMutation.mutate();
  }

  function handlePinChange(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPin) {
      setPinError('Введите текущий PIN');
      return;
    }
    if (!PIN_PATTERN.test(newPin)) {
      setPinError('Новый PIN: 4–8 цифр');
      return;
    }
    setPinError(null);
    pinMutation.mutate();
  }

  return (
    <Card className="border-stone-200 shadow-sm dark:border-stone-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4 text-emerald-600" aria-hidden="true" />
          Настройки копи-центра
        </CardTitle>
        <CardDescription>
          Значения отображаются клиентам на сайте
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-price">Цена ч/б страницы, ₽</Label>
              <Input
                id="pf-price"
                type="number"
                step="0.5"
                min="0.5"
                max="1000"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  if (priceError) setPriceError(null);
                }}
                className="h-11"
                aria-invalid={Boolean(priceError)}
                aria-describedby={priceError ? 'pf-price-error' : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-color-price">Цена цветной страницы, ₽</Label>
              <Input
                id="pf-color-price"
                type="number"
                step="0.5"
                min="0.5"
                max="1000"
                value={colorPrice}
                onChange={(event) => {
                  setColorPrice(event.target.value);
                  if (priceError) setPriceError(null);
                }}
                className="h-11"
                aria-invalid={Boolean(priceError)}
                aria-describedby={priceError ? 'pf-price-error' : undefined}
              />
            </div>
          </div>
          {priceError && (
            <p
              id="pf-price-error"
              role="alert"
              className="text-sm font-medium text-red-600 dark:text-red-400"
            >
              {priceError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="pf-address">Адрес самовывоза</Label>
            <Input
              id="pf-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="h-11"
              required
            />
          </div>

          {/* Pickup-location map (Yandex widget, Round 3) */}
          <div className="space-y-2 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <Label>Расположение на карте</Label>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Метка на карте видна клиентам в карточке «Как нас найти». Чтобы
              переместить её, укажите координаты в полях ниже — после ввода
              карта перестроится. Узнать координаты места можно в Яндекс
              Картах: правый клик по нужному месту → «Что здесь?».
            </p>
            <PickupMap lat={mapCoords.lat} lon={mapCoords.lon} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pf-map-lat">Широта (−90…90)</Label>
                <Input
                  id="pf-map-lat"
                  value={latText}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={String(DEFAULT_MAP_LAT)}
                  onChange={(event) => {
                    setLatText(event.target.value);
                    if (mapError) setMapError(null);
                  }}
                  onBlur={commitCoordsFromInputs}
                  className="h-11 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-map-lon">Долгота (−180…180)</Label>
                <Input
                  id="pf-map-lon"
                  value={lonText}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={String(DEFAULT_MAP_LON)}
                  onChange={(event) => {
                    setLonText(event.target.value);
                    if (mapError) setMapError(null);
                  }}
                  onBlur={commitCoordsFromInputs}
                  className="h-11 font-mono"
                />
              </div>
            </div>
            {mapError && (
              <p
                role="alert"
                className="text-sm font-medium text-red-600 dark:text-red-400"
              >
                {mapError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-hours">Часы работы</Label>
            <Input
              id="pf-hours"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="h-11"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-estimate">Срок готовности заказа</Label>
            <Textarea
              id="pf-estimate"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
              rows={2}
              required
            />
          </div>

          <Button
            type="submit"
            className="h-11 px-6"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Сохранить настройки
          </Button>
        </form>

        <Separator className="my-6" />

        <Collapsible open={pinOpen} onOpenChange={setPinOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full justify-between px-4 text-stone-700 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
              aria-expanded={pinOpen}
            >
              <span className="flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden="true" />
                Смена PIN-кода
              </span>
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  pinOpen && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <form onSubmit={handlePinChange} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pf-pin-current">Текущий PIN</Label>
                  <Input
                    id="pf-pin-current"
                    type="password"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(event) =>
                      setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 8))
                    }
                    className="h-11 font-mono"
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-pin-new">Новый PIN (4–8 цифр)</Label>
                  <Input
                    id="pf-pin-new"
                    type="password"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(event) =>
                      setNewPin(event.target.value.replace(/\D/g, '').slice(0, 8))
                    }
                    className="h-11 font-mono"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {pinError && (
                <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                  {pinError}
                </p>
              )}
              <Button
                type="submit"
                variant="outline"
                className="h-11 px-6"
                disabled={pinMutation.isPending}
              >
                {pinMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                Изменить PIN
              </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
