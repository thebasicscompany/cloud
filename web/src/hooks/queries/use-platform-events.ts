"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  buildReplayTrace,
  collectPlatformEvents,
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
      await delay();
      const store = readPlatformEventStore();
      return { store, events: collectPlatformEvents(store) };
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
    const events = collectPlatformEvents(next);
    queryClient.setQueryData(PLATFORM_EVENTS_QUERY_KEY, { store: next, events });
    return { store: next, events };
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

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
