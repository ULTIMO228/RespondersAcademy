"use client";

import { useEffect, useState } from "react";

import { resolveExpectedCall } from "@/features/call-control";
import type { ExpectedCall } from "@/features/call-control";
import type { InternalNumber } from "@/shared/api";

import { defaultPhoneApi } from "../api/phoneApi";
import type { PhoneApi } from "../api/phoneApi";
import { toTrainingCardId } from "../lib/cardContext";
import { toErrorState } from "./loadState";
import type { LoadState } from "./loadState";

export type PhoneDirectory = {
  numbers: InternalNumber[];
  /** Подсказка ожидаемого номера — только при переходе из карточки (cardId). */
  expected: ExpectedCall | null;
};

async function loadDirectory(cardId: string | null, api: PhoneApi, signal: AbortSignal) {
  const reference = await api.getReference(signal);
  if (!cardId) return { numbers: reference.internalNumbers, expected: null };
  const trainingId = toTrainingCardId(cardId);
  const [scenarios, details] = await Promise.all([
    api.listScenarios(signal),
    api.getCard(trainingId, signal).catch(() => null),
  ]);
  const card = details?.kind === "training" ? details.card : null;
  const expected = resolveExpectedCall({
    cardId: trainingId,
    card,
    scenarios,
    numbers: reference.internalNumbers,
  });
  return { numbers: reference.internalNumbers, expected };
}

/** Справочник internalNumbers (GET /reference) + ожидаемый номер по карточке (сценарии, карточка). */
export function usePhoneDirectory(cardId: string | null, api: PhoneApi = defaultPhoneApi) {
  const [state, setState] = useState<LoadState<PhoneDirectory>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    loadDirectory(cardId, api, controller.signal).then(
      (data) => !controller.signal.aborted && setState({ status: "ready", data }),
      (error: unknown) => !controller.signal.aborted && setState(toErrorState(error)),
    );
    return () => controller.abort();
  }, [cardId, api]);

  return state;
}
