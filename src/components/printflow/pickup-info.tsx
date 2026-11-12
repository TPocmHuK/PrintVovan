'use client';

/**
 * PickupInfoSection — блок «Как нас найти» на главной странице (под окном
 * оформления заказа): контакты самовывоза + карта расположения (виджет
 * Яндекс Карт). На шаге «Контакты» wizard'а не показывается — там своя
 * карточка с картой, чтобы не дублировать её дважды на экране.
 */

import { Clock, Map, MapPin, MessageSquare, Timer } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { PickupMap } from './pickup-map';
import { resolveMapCoords, type SettingsPublic } from './types';

export function PickupInfoSection({ settings }: { settings: SettingsPublic }) {
  const { lat, lon } = resolveMapCoords(settings);

  return (
    <Card className="border-stone-200 shadow-sm dark:border-stone-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Map className="size-4 text-emerald-600" aria-hidden="true" />
          Как нас найти
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-stone-400"
              aria-hidden="true"
            />
            <span>{settings.pickupAddress}</span>
          </p>
          <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
            <Clock
              className="mt-0.5 size-4 shrink-0 text-stone-400"
              aria-hidden="true"
            />
            <span>{settings.workingHours}</span>
          </p>
          <p className="flex items-start gap-2.5 text-stone-700 dark:text-stone-300">
            <Timer
              className="mt-0.5 size-4 shrink-0 text-stone-400"
              aria-hidden="true"
            />
            <span>{settings.readyEstimate}</span>
          </p>
          <p className="flex items-start gap-2.5 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
            <MessageSquare
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              После оформления вы получите код заказа — назовите его сотруднику
              при получении. Рядом с картой можно построить маршрут.
            </span>
          </p>
        </div>
        <PickupMap lat={lat} lon={lon} />
      </CardContent>
    </Card>
  );
}
