"use client";

import { useEffect, useState } from "react";

import type { ReactionRecord } from "../lib/reactionTimer";
import { buildOpenedRecord } from "../lib/reactionTimer";
import { toMoscowIso } from "../lib/time";
import { useJournalDeps } from "./deps";
import { readStored, STORAGE_KEYS, writeStored } from "./storedValue";

export type ReactionRecords = Record<string, ReactionRecord>;

export function reactionKey(sessionId: string, cardId: string): string {
  return `${sessionId}:${cardId}`;
}

type ReactionTarget = { sessionId: string; cardId: string; issuedAt: string };

/**
 * Фиксация первичной реакции (T2.2-06): открытие карточки останавливает таймер и пишет openedAt/primaryReactionMs,
 * истечение без открытия — нарушение. Записи — в хранилище браузера (arm112.journal.reactions) до появления
 * эндпоинта попыток (CardEvent создаёт карточка, T2.3-01); повторное открытие не перезаписывает факт.
 */
export function useReactions(normMs: number) {
  const { clock, storage } = useJournalDeps();
  const [records, setRecords] = useState<ReactionRecords>({});

  useEffect(() => {
    setRecords(readStored<ReactionRecords>(storage, STORAGE_KEYS.reactions, {}));
  }, [storage]);

  function save(key: string, record: ReactionRecord) {
    setRecords((current) => {
      const next = { ...current, [key]: record };
      writeStored(storage, STORAGE_KEYS.reactions, next);
      return next;
    });
  }

  function recordOpen(target: ReactionTarget) {
    const key = reactionKey(target.sessionId, target.cardId);
    if (records[key]?.openedAt) return;
    save(key, buildOpenedRecord(target, toMoscowIso(clock.now()), normMs));
  }

  function recordExpired(target: ReactionTarget) {
    const key = reactionKey(target.sessionId, target.cardId);
    if (records[key]) return;
    save(key, { ...target, openedAt: null, primaryReactionMs: null, isViolation: true });
  }

  return { records, recordOpen, recordExpired };
}
