'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, FileUp, SlidersHorizontal, User } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import * as api from './api';
import { errorMessage } from './api';
import { ConfigStep } from './config-step';
import { ContactStep, type ContactPayload } from './contact-step';
import { clampCopies, getUploadFormat, validatePageRange } from './format';
import { useDocumentStatus, useQuote, useSettings } from './hooks';
import { PickupInfoSection } from './pickup-info';
import type { PreviewPage } from './page-preview';
import { SuccessStep } from './success-step';
import { UploadStep } from './upload-step';
import {
  DEFAULT_SETTINGS,
  resolveColorPrice,
  type CreateOrderPayload,
  type DocumentPageColor,
  type OrderCreated,
  type PageColorMap,
  type QuotePayload,
} from './types';

type WizardStep = 'upload' | 'config' | 'contact' | 'success';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const STEPS = [
  { key: 'upload', label: 'Файл', icon: FileUp },
  { key: 'config', label: 'Параметры', icon: SlidersHorizontal },
  { key: 'contact', label: 'Контакты', icon: User },
  { key: 'success', label: 'Готово', icon: CheckCircle2 },
] as const;

function StepIndicator({ current }: { current: WizardStep }) {
  const activeIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="mb-6 flex items-start" aria-label="Шаги оформления заказа">
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const Icon = step.icon;
        return (
          <li
            key={step.key}
            className="flex flex-1 items-start last:flex-none"
          >
            <div
              className="flex w-14 flex-col items-center gap-1.5"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-full border-2 text-sm font-semibold transition-colors',
                  done &&
                    'border-emerald-600 bg-emerald-600 text-white',
                  active &&
                    'border-emerald-600 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                  !done &&
                    !active &&
                    'border-stone-200 bg-white text-stone-400 dark:border-stone-700 dark:bg-stone-900',
                )}
              >
                {done ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Icon className="size-4" aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  'text-center text-xs leading-tight',
                  active
                    ? 'font-semibold text-stone-900 dark:text-stone-100'
                    : 'text-stone-500 dark:text-stone-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'mt-[17px] h-0.5 flex-1 rounded-full',
                  done
                    ? 'bg-emerald-500'
                    : 'bg-stone-200 dark:bg-stone-700',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function OrderWizard({
  onTrackOrder,
}: {
  onTrackOrder: (code: string) => void;
}) {
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>('upload');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const statusQuery = useDocumentStatus(documentId);
  const doc = statusQuery.data ?? null;

  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all');
  const [rangeText, setRangeText] = useState('');
  const [copiesText, setCopiesText] = useState('1');
  const copies = clampCopies(Number.parseInt(copiesText, 10) || 1);

  // Ручные пометки цветности: pageNumber → эффективная цветность (Round 4).
  const [userColors, setUserColors] = useState<Record<number, boolean>>({});

  const [order, setOrder] = useState<OrderCreated | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const settingsQuery = useSettings();
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;

  const analyzed = doc?.status === 'analyzed';
  const rangeError =
    rangeMode === 'custom' && doc
      ? validatePageRange(rangeText, doc.totalPages ?? 0)
      : null;

  // Эффективная цветность страниц (авторезультат + ручные пометки).
  const docPages: DocumentPageColor[] = useMemo(
    () => (analyzed && doc?.pages ? doc.pages : []),
    [analyzed, doc?.pages],
  );

  const previewPages: PreviewPage[] = useMemo(
    () =>
      docPages.map((page) => {
        const override = userColors[page.pageNumber];
        return {
          pageNumber: page.pageNumber,
          isColor: override ?? page.isColor,
          overridden: override !== undefined && override !== page.isColor,
        };
      }),
    [docPages, userColors],
  );

  /** Полная карта эффективной цветности для API (null — нет данных постранично). */
  function buildColorMap(): PageColorMap | undefined {
    if (docPages.length === 0) return undefined;
    const map: PageColorMap = {};
    for (const page of docPages) {
      map[page.pageNumber] = userColors[page.pageNumber] ?? page.isColor;
    }
    return map;
  }

  const overrideCount = useMemo(
    () =>
      docPages.reduce((count, page) => {
        const override = userColors[page.pageNumber];
        return override !== undefined && override !== page.isColor ? count + 1 : count;
      }, 0),
    [docPages, userColors],
  );

  function handleTogglePageColor(pageNumber: number) {
    const auto = docPages.find((page) => page.pageNumber === pageNumber)?.isColor ?? false;
    setUserColors((prev) => ({
      ...prev,
      [pageNumber]: !(prev[pageNumber] ?? auto),
    }));
  }

  function handleResetColorOverrides() {
    setUserColors({});
  }

  // Debounced (300 ms) quote request — only when the document is analyzed
  // and the range is valid.
  const [quotePayload, setQuotePayload] = useState<QuotePayload | null>(null);
  useEffect(() => {
    const invalid = !documentId || !analyzed || (rangeMode === 'custom' && rangeError);
    const timer = setTimeout(
      () => {
        if (invalid) {
          setQuotePayload(null);
        } else {
          setQuotePayload({
            documentId,
            pageRangeText: rangeMode === 'all' ? 'all' : rangeText.trim(),
            copies,
            colorOverrides: buildColorMap(),
          });
        }
      },
      invalid ? 0 : 300,
    );
    return () => clearTimeout(timer);
  }, [documentId, analyzed, rangeMode, rangeText, copies, rangeError, docPages, userColors]);

  const quoteQuery = useQuote(quotePayload);
  const quoteError = quoteQuery.error ? errorMessage(quoteQuery.error) : null;

  // Auto-advance to config once the analysis succeeds.
  useEffect(() => {
    if (doc?.status !== 'analyzed') return;
    const timer = setTimeout(() => {
      setStep((current) => (current === 'upload' ? 'config' : current));
    }, 900);
    return () => clearTimeout(timer);
  }, [doc?.status]);

  // Guard: without a document there is nothing to configure.
  useEffect(() => {
    if ((step === 'config' || step === 'contact') && documentId === null) {
      const timer = setTimeout(() => setStep('upload'), 0);
      return () => clearTimeout(timer);
    }
  }, [step, documentId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  async function handleFile(file: File) {
    // Round 2: PDF, DOC and DOCX are accepted (validated by extension;
    // the server additionally checks magic bytes).
    if (!getUploadFormat(file.name)) {
      toast({
        title: 'Поддерживаются форматы PDF, DOC и DOCX',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'Файл слишком большой (максимум 25 МБ)',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploadDocument(file);
      setDocumentId(res.documentId);
    } catch (error) {
      toast({
        title: 'Не удалось загрузить файл',
        description: errorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  function resetDocument() {
    setDocumentId(null);
    setStep('upload');
    setRangeMode('all');
    setRangeText('');
    setCopiesText('1');
    setUserColors({});
    setServerError(null);
  }

  function resetAll() {
    resetDocument();
    setOrder(null);
  }

  const createOrderMutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => api.createOrder(payload),
    onSuccess: (created) => {
      setServerError(null);
      setOrder(created);
      setStep('success');
    },
    onError: (error) => {
      const message = errorMessage(error);
      setServerError(message);
      toast({
        title: 'Не удалось оформить заказ',
        description: message,
        variant: 'destructive',
      });
    },
  });

  function submitContact(payload: ContactPayload) {
    if (!documentId) {
      setStep('upload');
      return;
    }
    createOrderMutation.mutate({
      documentId,
      pageRangeText: rangeMode === 'all' ? 'all' : rangeText.trim(),
      copies,
      colorOverrides: buildColorMap(),
      ...payload,
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-stone-200 shadow-sm dark:border-stone-800">
        <CardContent className="p-4 sm:p-6">
        <StepIndicator current={step} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {step === 'upload' && (
              <UploadStep
                uploading={uploading}
                documentId={documentId}
                documentStatus={doc}
                isStatusLoading={statusQuery.isLoading && documentId !== null}
                onFileSelected={handleFile}
                onReset={resetDocument}
              />
            )}

            {step === 'config' && doc && doc.status === 'analyzed' && (
              <ConfigStep
                documentStatus={doc}
                rangeMode={rangeMode}
                rangeText={rangeText}
                rangeError={rangeError}
                copies={copies}
                copiesText={copiesText}
                quote={quoteQuery.data ?? null}
                quoteLoading={quoteQuery.isFetching}
                quoteError={quoteError}
                pages={previewPages}
                overrideCount={overrideCount}
                colorPrice={resolveColorPrice(settings)}
                onTogglePageColor={handleTogglePageColor}
                onResetColorOverrides={handleResetColorOverrides}
                onRangeModeChange={setRangeMode}
                onRangeTextChange={setRangeText}
                onCopiesTextChange={setCopiesText}
                onCopiesStep={(delta) =>
                  setCopiesText(String(clampCopies(copies + delta)))
                }
                onBack={() => setStep('upload')}
                onNext={() => setStep('contact')}
                onResetDocument={resetDocument}
              />
            )}

            {step === 'contact' && (
              <ContactStep
                settings={settings}
                submitting={createOrderMutation.isPending}
                serverError={serverError}
                onSubmit={submitContact}
                onBack={() => setStep('config')}
              />
            )}

            {step === 'success' && order && (
              <SuccessStep
                order={order}
                onTrack={() => onTrackOrder(order.code)}
                onReset={resetAll}
              />
            )}
          </motion.div>
        </AnimatePresence>
        </CardContent>
      </Card>

      {/* «Как нас найти» на главной; на шаге «Контакты» своя карточка с картой. */}
      {step !== 'contact' && <PickupInfoSection settings={settings} />}
    </div>
  );
}
