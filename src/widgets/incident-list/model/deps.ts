"use client";

import { createContext, useContext } from "react";

import {
  createSession,
  getCard,
  getCards,
  getReference,
  getSessionFeed,
  listScenarios,
  listSessions,
  postCardLinks,
  postCardReminder,
  startSession,
} from "@/shared/api";
import { createWebStorage, systemClock } from "@/shared/lib";
import type { Clock, KeyValueStorage } from "@/shared/lib";

import { createBeepPlayer } from "../lib/sound";
import type { SoundPlayer } from "../lib/sound";

/*
 * Зависимости ленты за интерфейсами (spec/000-фронт/10-code-rules.md §6): клиент мок-слоя, часы, хранилище, звук,
 * prefers-reduced-motion. По умолчанию — боевые реализации; тесты подменяют через проп `deps` IncidentJournal.
 */

export type JournalApi = {
  getReference: typeof getReference;
  getCards: typeof getCards;
  getCard: typeof getCard;
  postCardLinks: typeof postCardLinks;
  postCardReminder: typeof postCardReminder;
  listSessions: typeof listSessions;
  listScenarios: typeof listScenarios;
  createSession: typeof createSession;
  startSession: typeof startSession;
  getSessionFeed: typeof getSessionFeed;
};

export type JournalDeps = {
  api: JournalApi;
  clock: Clock;
  storage: KeyValueStorage;
  sound: SoundPlayer;
  prefersReducedMotion: () => boolean;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export const defaultJournalApi: JournalApi = {
  getReference,
  getCards,
  getCard,
  postCardLinks,
  postCardReminder,
  listSessions,
  listScenarios,
  createSession,
  startSession,
  getSessionFeed,
};

export const defaultJournalDeps: JournalDeps = {
  api: defaultJournalApi,
  clock: systemClock,
  storage: createWebStorage(() => (typeof window === "undefined" ? undefined : window.localStorage)),
  sound: createBeepPlayer(),
  prefersReducedMotion: readReducedMotion,
};

export const JournalDepsContext = createContext<JournalDeps>(defaultJournalDeps);

export function useJournalDeps(): JournalDeps {
  return useContext(JournalDepsContext);
}
