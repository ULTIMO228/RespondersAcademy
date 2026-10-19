"use client";

import { useState } from "react";

import { saveErrorMapVerdict } from "@/shared/api";
import type { ErrorMapExplanation, ErrorMapVerdictRequest, VerdictKind } from "@/shared/api";
import { AiBadge } from "@/shared/ui";

import styles from "./ErrorMap.module.css";

/** Что известно о месте, где показано пояснение: уходит в запрос вместе с хэшем текста, источником и ответом. */
export type AiExplainTarget = Omit<ErrorMapVerdictRequest, "textHash" | "source" | "verdict">;

export interface AiExplainProps {
  explanation: ErrorMapExplanation;
  target: AiExplainTarget;
  /** Сохранение ответа; в тестах подменяется. */
  save?: (body: ErrorMapVerdictRequest) => Promise<void>;
}

const VERDICTS: ReadonlyArray<{ kind: VerdictKind; label: string; icon: string }> = [
  { kind: "agree", label: "Согласен", icon: "✓" },
  { kind: "disagree", label: "Не согласен", icon: "✕" },
];

/**
 * Блок «Почему так происходит» (FR-016…FR-019): 1–2 фразы, пометка «ИИ» либо «справочное пояснение»,
 * ответ преподавателя «Согласен / Не согласен». Ответ — значок и слово, кнопки нажимаются заново; ошибка
 * сохранения не стирает прежний ответ. Пояснение карту и оценки не меняет — приоритет за преподавателем.
 */
export function AiExplain({ explanation, target, save = saveErrorMapVerdict }: AiExplainProps) {
  // Состояние привязано к тексту: новый текст — новый вердикт (хэш в ключе).
  return <ExplainBody key={explanation.textHash} explanation={explanation} target={target} save={save} />;
}

function ExplainBody({ explanation, target, save }: Required<AiExplainProps>) {
  const [verdict, setVerdict] = useState<VerdictKind | undefined>(explanation.verdict);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const isAi = explanation.source === "ai";

  async function choose(next: VerdictKind) {
    setPending(true);
    setFailed(false);
    try {
      await save({ ...target, textHash: explanation.textHash, source: explanation.source, verdict: next });
      setVerdict(next);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const current = VERDICTS.find((item) => item.kind === verdict);
  return (
    <section className={styles.explain} aria-labelledby="error-map-explain-title">
      <h3 id="error-map-explain-title" className={styles.explain__title}>
        Почему так происходит ({isAi ? "предположение ИИ" : "справочное пояснение"}){" "}
        {isAi ? <AiBadge title="Предположение ИИ-модуля: решение остаётся за преподавателем" /> : null}
      </h3>
      <p className={styles.explain__text}>{explanation.text}</p>
      <p className={styles.explain__note}>Это подсказка, а не оценка: решение остаётся за вами.</p>
      <div className={styles.explain__actions} role="group" aria-label="Ваш ответ на предположение">
        {VERDICTS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className={styles.explain__button}
            aria-pressed={verdict === item.kind}
            disabled={pending}
            onClick={() => void choose(item.kind)}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </div>
      {current ? (
        <p className={styles.explain__answer}>
          Ваш ответ: <strong>{current.label}</strong>
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className={styles.explain__error}>
          Не удалось сохранить ответ. Нажмите кнопку ещё раз.
        </p>
      ) : null}
    </section>
  );
}
