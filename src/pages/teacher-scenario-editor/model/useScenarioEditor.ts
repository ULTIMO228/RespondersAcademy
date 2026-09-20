"use client";

import { useCallback, useEffect, useState } from "react";

import type { Scenario, ScenarioUpdateRequest, ScenarioValidateAction } from "@/shared/api";

import { defaultScenarioEditorApi } from "../api/editorApi";
import type { ScenarioEditorApi } from "../api/editorApi";

export type ScenarioEditorState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; scenario: Scenario };

type UseScenarioEditorOptions = {
  scenarioId: string;
  /** Преподаватель сессии: reviewedBy решений валидации и автор записей аудита. */
  teacherId: string;
  api?: ScenarioEditorApi;
};

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Состояние редактора: живой сценарий из мок-слоя + сохранение правок, коррекции и решений. */
export function useScenarioEditor({
  scenarioId,
  teacherId,
  api = defaultScenarioEditorApi,
}: UseScenarioEditorOptions) {
  const [state, setState] = useState<ScenarioEditorState>({ status: "loading" });
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    setState({ status: "loading" });
    api
      .getScenario(scenarioId, controller.signal)
      .then((scenario) => {
        if (isActive) setState({ status: "ready", scenario });
      })
      .catch((error: unknown) => {
        if (isActive && !controller.signal.aborted) {
          setState({ status: "error", message: toMessage(error, `Сценарий ${scenarioId} не найден`) });
        }
      });
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [api, scenarioId]);

  const applyResult = useCallback((scenario: Scenario, text: string) => {
    setState({ status: "ready", scenario });
    setNotice({ kind: "saved", text });
  }, []);

  const save = useCallback(
    async (patch: Omit<ScenarioUpdateRequest, "updatedBy">, text: string) => {
      try {
        applyResult(await api.updateScenario(scenarioId, { ...patch, updatedBy: teacherId }), text);
      } catch (error) {
        setNotice({ kind: "error", text: toMessage(error, "Не удалось сохранить изменения") });
      }
    },
    [api, applyResult, scenarioId, teacherId],
  );

  const decide = useCallback(
    async (action: ScenarioValidateAction, options: { fields?: string[]; comment?: string } = {}) => {
      try {
        const scenario = await api.validateScenario(scenarioId, {
          action,
          reviewedBy: teacherId,
          ...options,
        });
        applyResult(scenario, DECISION_MESSAGES[action]);
        return scenario;
      } catch (error) {
        setNotice({ kind: "error", text: toMessage(error, "Действие недоступно в текущем статусе") });
        return null;
      }
    },
    [api, applyResult, scenarioId, teacherId],
  );

  const regenerate = useCallback(
    async (category: string) => {
      try {
        const generated = await api.generateScenarios({ category, requestedBy: teacherId });
        setNotice({
          kind: "saved",
          text: `Повторная генерация (ИИ, мок): исправленных вариантов — ${generated.length}`,
        });
        return generated;
      } catch (error) {
        setNotice({ kind: "error", text: toMessage(error, "Не удалось перегенерировать сценарий") });
        return [];
      }
    },
    [api, teacherId],
  );

  const checkGrammar = useCallback(
    async (text: string, field?: string) => (await api.checkGrammar(text, field)).data,
    [api],
  );

  return { state, notice, save, decide, regenerate, checkGrammar };
}

const DECISION_MESSAGES: Record<ScenarioValidateAction, string> = {
  submit: "Комментарий коррекции сохранён, сценарий отправлен на проверку",
  approve: "Сценарий утверждён полностью",
  approvePartial: "Сохранён выбор полей частичного утверждения",
  reject: "Сценарий отклонён",
};
