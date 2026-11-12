'use client';

/**
 * React Query hooks for the PrintFlow frontend.
 * Polling intervals per contract: document status 1200 ms while queued/analyzing,
 * tracking order 5000 ms, admin orders 5000 ms.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from './api';
import { ApiError } from './api';
import type { QuotePayload } from './types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.fetchSettings(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDocumentStatus(documentId: string | null) {
  return useQuery({
    queryKey: ['document-status', documentId],
    queryFn: () => api.getDocumentStatus(documentId as string),
    enabled: Boolean(documentId),
    retry: 1,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // 'converting' is Round 2 (LibreOffice DOC/DOCX → PDF): keep polling
      // through it, otherwise the client would freeze on a transient status.
      return status === 'queued' ||
        status === 'converting' ||
        status === 'analyzing'
        ? 1200
        : false;
    },
  });
}

export function useQuote(payload: QuotePayload | null) {
  return useQuery({
    queryKey: [
      'quote',
      payload?.documentId,
      payload?.pageRangeText,
      payload?.copies,
      payload?.colorOverrides ?? null,
    ],
    queryFn: () => api.quoteOrder(payload as QuotePayload),
    enabled: Boolean(payload),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: false,
  });
}

export function useTrackingOrder(code: string | null) {
  return useQuery({
    queryKey: ['tracking', code],
    queryFn: () => api.fetchTrackingOrder(code as string),
    enabled: Boolean(code),
    refetchInterval: 5000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useAdminOrders(enabled: boolean, onUnauthorized?: () => void) {
  return useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      try {
        return await api.fetchAdminOrders();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized?.();
        }
        throw error;
      }
    },
    enabled,
    refetchInterval: 5000,
    retry: false,
  });
}
