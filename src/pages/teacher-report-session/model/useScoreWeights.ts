"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_WEIGHT_PERCENTS, getWeightsSum, isWeightsSumValid } from "@/entities/report";
import type { ScoreAxis, ScoreWeights } from "@/entities/report";
import { createWebStorage } from "@/shared/lib";
import type { KeyValueStorage } from "@/shared/lib";

/** Веса критериев — настройка преподавателя, переживает перезагрузку страницы (T3.4-08). */
export const SCORE_WEIGHTS_STORAGE_KEY = "arm112_score_weights";

function parseWeights(raw: string | null): ScoreWeights | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const axes = Object.keys(DEFAULT_WEIGHT_PERCENTS) as ScoreAxis[];
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<Record<ScoreAxis, unknown>>;
    if (axes.some((axis) => typeof record[axis] !== "number")) return null;
    return Object.fromEntries(axes.map((axis) => [axis, record[axis]])) as ScoreWeights;
  } catch {
    return null;
  }
}

/**
 * Веса критериев интегрального балла: правятся на лету, сохраняются в конфиг браузера и
 * применяются к пересчёту только при валидной сумме 100 % (иначе форма показывает ошибку).
 */
export function useScoreWeights(storage?: KeyValueStorage) {
  const store = useMemo(() => storage ?? createWebStorage(() => window.localStorage), [storage]);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHT_PERCENTS);
  /** Последние корректные веса: по ним считается балл, пока форма в невалидном состоянии. */
  const [applied, setApplied] = useState<ScoreWeights>(DEFAULT_WEIGHT_PERCENTS);

  useEffect(() => {
    const stored = parseWeights(store.get(SCORE_WEIGHTS_STORAGE_KEY));
    if (!stored || !isWeightsSumValid(stored)) return;
    setWeights(stored);
    setApplied(stored);
  }, [store]);

  const setAxisWeight = useCallback(
    (axis: ScoreAxis, value: number) => {
      const next = { ...weights, [axis]: value };
      setWeights(next);
      if (!isWeightsSumValid(next)) return;
      store.set(SCORE_WEIGHTS_STORAGE_KEY, JSON.stringify(next));
      setApplied(next);
    },
    [store, weights],
  );

  const reset = useCallback(() => {
    setWeights(DEFAULT_WEIGHT_PERCENTS);
    setApplied(DEFAULT_WEIGHT_PERCENTS);
    store.remove(SCORE_WEIGHTS_STORAGE_KEY);
  }, [store]);

  return {
    weights,
    applied,
    setAxisWeight,
    reset,
    sum: getWeightsSum(weights),
    isValid: isWeightsSumValid(weights),
  };
}
