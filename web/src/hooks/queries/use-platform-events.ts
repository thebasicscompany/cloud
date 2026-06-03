"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  buildReplayTrace,
  createInitialPlatformEventStore,
  filterPlatformEvents,
  labelPlatformEvent,
  readPlatformEventStore,
  setTrainingConsentMode,
  summarizePlatformEvents,
  writePlatformEventStore,
} from "@/lib/platform-events-runtime";
import type { PlatformEvent, PlatformEventFilters, PlatformFeedbackLabel, PlatformEventStore, TrainingConsentMode } from "@/types/platform-events";

export const PLATFORM_EVENTS_QUERY_KEY = ["platform-events"];

export function usePlatformEventStore() {
  return useQuery({
    queryKey: PLATFORM_EVENTS_QUERY_KEY,
    queryFn: async (): Promise<{ store: PlatformEventStore; events: PlatformEvent[] }> => {
      // The store is now ONLY the local feedback/training-consent ledger
      // (user-applied labels). Events come exclusively from the REAL
      // cloud_activity action log the cloud worker writes (/api/logs).
      const store = readPlatformEventStore();
      let real: PlatformEvent[] = [];
      try {
        const res = await fetch("/api/logs");
        if (res.ok) real = ((await res.json()).events ?? []) as PlatformEvent[];
      } catch {
        // network/transient - render an empty log rather than mock rows
      }
      const events = real.map((event) => {
        const fb = store.feedback[event.id];
        return fb ? { ...event, feedback: fb, labels: [...event.labels, fb.label] } : event;
      });
      return { store, events };
    },
  });
}

export function usePlatformEvents(filters: PlatformEventFilters = {}) {
  const query = usePlatformEventStore();
  const events = query.data?.events ?? [];
  const store = query.data?.store ?? createInitialPlatformEventStore();
  return {
    ...query,
    data: {
      store,
      events: filterPlatformEvents(events, filters),
      allEvents: events,
      summary: summarizePlatformEvents(events, store),
    },
  };
}

export function usePlatformEvent(eventId: string | undefined) {
  const query = usePlatformEventStore();
  const events = query.data?.events ?? [];
  const store = query.data?.store ?? createInitialPlatformEventStore();
  const event = eventId ? events.find((candidate) => candidate.id === eventId) : undefined;
  return {
    ...query,
    data: event
      ? {
          event,
          replay: buildReplayTrace(event, events, store),
          allEvents: events,
          store,
        }
      : undefined,
  };
}

export function usePlatformEventActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: PlatformEventStore) => PlatformEventStore) => {
    const current = readPlatformEventStore();
    const next = writePlatformEventStore(updater(current));
    // Feedback/training labels changed locally - refetch so the real event
    // stream re-applies them.
    void queryClient.invalidateQueries({ queryKey: PLATFORM_EVENTS_QUERY_KEY });
    return { store: next };
  };

  const label = useMutation({
    mutationFn: async ({ eventId, feedback, note }: { eventId: string; feedback: PlatformFeedbackLabel; note?: string }) =>
      updateStore((store) => labelPlatformEvent(store, eventId, feedback, note)),
  });

  const setTrainingMode = useMutation({
    mutationFn: async (mode: TrainingConsentMode) =>
      updateStore((store) => setTrainingConsentMode(store, mode)),
  });

  return {
    label,
    setTrainingMode,
  };
}
