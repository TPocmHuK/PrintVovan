'use client';

import { useState } from 'react';
import { ArrowLeft, Clock, Loader2, Map, MapPin, MessageSquare, Timer } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { resolveMapCoords, type SettingsPublic } from './types';
import { PickupMap } from './pickup-map';

const PHONE_PATTERN = /^\+?[\d\s\-()]{7,18}$/;

export interface ContactPayload {
  customerName: string;
  customerPhone: string;
  comment?: string;
}

export function ContactStep({
  settings,
  submitting,
  serverError,
  onSubmit,
  onBack,
}: {
  settings: SettingsPublic;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (payload: ContactPayload) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const { lat, lon } = resolveMapCoords(settings);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    const nextNameError =
      trimmedName.length < 2 || trimmedName.length > 80
        ? 'Укажите имя (2–80 символов)'
        : null;
    const nextPhoneError = PHONE_PATTERN.test(trimmedPhone)
      ? null
      : 'Укажите корректный телефон';

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    if (nextNameError || nextPhoneError) return;

    const trimmedComment = comment.trim();
    onSubmit({
      customerName: trimmedName,
      customerPhone: trimmedPhone,
      comment: trimmedComment ? trimmedComment : undefined,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-4">
        {serverError && (
          <Alert
            variant="destructive"
            className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
          >
            <AlertTitle>Не удалось оформить заказ</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Контакты</CardTitle>
            <CardDescription>
              Мы свяжемся с вами, если возникнут вопросы по заказу
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pf-name">Имя</Label>
              <Input
                id="pf-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Как к вам обращаться"
                autoComplete="name"
                maxLength={80}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'pf-name-error' : undefined}
                className="h-11"
              />
              {nameError && (
                <p
                  id="pf-name-error"
                  role="alert"
                  className="text-sm font-medium text-red-600 dark:text-red-400"
                >
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-phone">Телефон</Label>
              <Input
                id="pf-phone"
                type="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                placeholder="+7 (999) 123-45-67"
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? 'pf-phone-error' : undefined}
                className="h-11"
              />
              {phoneError && (
                <p
                  id="pf-phone-error"
                  role="alert"
                  className="text-sm font-medium text-red-600 dark:text-red-400"
                >
                  {phoneError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="pf-comment">Комментарий (необязательно)</Label>
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  {comment.length}/500
                </span>
              </div>
              <Textarea
                id="pf-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value.slice(0, 500))}
                placeholder="Например: нужна скрепка на каждый экземпляр"
                rows={3}
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            className="h-12 px-4 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            onClick={onBack}
            disabled={submitting}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Назад
          </Button>
          <Button
            type="submit"
            size="lg"
            className="h-12 flex-1 text-base"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Оформляем…
              </>
            ) : (
              'Подтвердить заказ'
            )}
          </Button>
        </div>
      </form>

      {/* Pickup info + map cards */}
      <div className="space-y-4 self-start">
        <Card className="border-stone-200 bg-stone-50/60 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-emerald-600" aria-hidden="true" />
              Получение заказа
            </CardTitle>
            <CardDescription>Самовывоз, оплата при получении</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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
                при получении.
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm dark:border-stone-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Map className="size-4 text-emerald-600" aria-hidden="true" />
              Как нас найти
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PickupMap lat={lat} lon={lon} />
            <p className="flex items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300">
              <MapPin
                className="mt-0.5 size-4 shrink-0 text-stone-400"
                aria-hidden="true"
              />
              <span>{settings.pickupAddress}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
