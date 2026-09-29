"use client";

import { useEffect, useState, useTransition } from "react";

import {
  STANDALONE_AI_NOTE,
  STANDALONE_AI_REASON,
  getAssessmentReview,
  getAssessmentState,
  resolveAssessment,
} from "@/shared/api";
import type {
  AssessmentAxes,
  AssessmentResolveRequest,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  Evaluation,
  EvaluationStatus,
  SemanticArbitrationDecision,
} from "@/shared/api";
import { AiBadge } from "@/shared/ui";

import styles from "./AIAssessmentPanel.module.css";

type AIAssessmentPanelProps = {
  attemptId: string | null;
  cardCompleted: boolean;
  initialEvaluation?: Evaluation | null;
  onEvaluationResolved?: () => void;
};

const STATUS_TITLES: Record<EvaluationStatus, string> = {
  pending: "Оценка формируется",
  preliminary: "Предварительно",
  review_required: "На проверке",
  final: "Итоговая",
};

const STATUS_BADGE_CLASSES: Record<EvaluationStatus, string> = {
  pending: styles["statusBadge--pending"],
  preliminary: styles["statusBadge--preliminary"],
  review_required: styles["statusBadge--review"],
  final: styles["statusBadge--final"],
};

export function AIAssessmentPanel({
  attemptId,
  cardCompleted,
  initialEvaluation,
  onEvaluationResolved,
}: AIAssessmentPanelProps) {
  const [assessmentState, setAssessmentState] = useState<AssessmentStateResponse | null>(null);
  const [reviewData, setReviewData] = useState<AssessmentReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPendingSubmit, startSubmit] = useTransition();

  // Поля формы арбитража
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [overrideComment, setOverrideComment] = useState<string>("");
  const [decisions, setDecisions] = useState<Record<string, "equivalent" | "different" | "uncertain">>({});

  // Загрузка состояния оценки
  useEffect(() => {
    if (!attemptId || !cardCompleted) {
      setAssessmentState(null);
      setReviewData(null);
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);

    getAssessmentState(attemptId, controller.signal)
      .then((state) => {
        if (controller.signal.aborted) return;
        setAssessmentState(state);
        setIsLoading(false);
        if (state.status === "review_required") {
          getAssessmentReview(attemptId, controller.signal)
            .then((review) => {
              if (controller.signal.aborted) return;
              setReviewData(review);
              setOverrideScore(review.totalScore != null ? String(review.totalScore) : "80");
              const initialDecisions: Record<string, "equivalent" | "different" | "uncertain"> = {};
              for (const item of review.semanticReviews) {
                initialDecisions[item.id] = item.decision;
              }
              setDecisions(initialDecisions);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [attemptId, cardCompleted]);

  // Вычисляем эффективные статус, ревизию и оси с учетом фоллбэка на initialEvaluation
  const effectiveStatus: EvaluationStatus =
    assessmentState?.status ??
    initialEvaluation?.status ??
    (initialEvaluation?.teacherOverride ? "final" : initialEvaluation ? "preliminary" : "pending");

  const effectiveRevision = assessmentState?.revision ?? initialEvaluation?.revision ?? 1;

  const effectiveAxes: AssessmentAxes = assessmentState?.axes ?? {
    timeScore: initialEvaluation?.timeScore ?? null,
    correctnessScore: initialEvaluation?.correctnessScore ?? null,
    grammarScore: initialEvaluation?.grammarScore ?? null,
    semanticScore: initialEvaluation?.semanticScore ?? null,
  };

  const effectiveTotalScore =
    assessmentState?.totalScore ??
    (effectiveStatus === "review_required" || effectiveStatus === "pending"
      ? null
      : (initialEvaluation?.teacherOverride?.score ?? initialEvaluation?.totalScore ?? null));

  const handleDecisionChange = (reviewId: string, decision: "equivalent" | "different" | "uncertain") => {
    setDecisions((prev) => ({ ...prev, [reviewId]: decision }));
  };

  const handleResolve = () => {
    if (!attemptId) return;
    const numScore = Number(overrideScore);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) {
      setSubmitError("Балл должен быть целым числом от 0 до 100");
      return;
    }
    if (!overrideComment.trim()) {
      setSubmitError("Укажите обоснование решения преподавателя");
      return;
    }

    setSubmitError(null);
    setSuccessMessage(null);

    const semanticDecisions: SemanticArbitrationDecision[] = Object.entries(decisions).map(
      ([reviewId, decision]) => ({
        reviewId,
        decision,
      }),
    );

    const payload: AssessmentResolveRequest = {
      expectedRevision: effectiveRevision,
      score: Math.round(numScore),
      comment: overrideComment.trim(),
      semanticDecisions: semanticDecisions.length > 0 ? semanticDecisions : undefined,
      requestId:
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`,
    };

    startSubmit(async () => {
      try {
        const response = await resolveAssessment(attemptId, payload);
        setSuccessMessage(
          `Оценка успешно утверждена (балл ${response.totalScore}, ревизия ${response.revision})`,
        );
        setReviewData(null);
        // Перечитываем актуальное состояние
        const updated = await getAssessmentState(attemptId);
        setAssessmentState(updated);
        onEvaluationResolved?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Ошибка при утверждении оценки";
        setSubmitError(msg);
      }
    });
  };

  if (!cardCompleted && !initialEvaluation) {
    return null;
  }

  return (
    <div className={styles.panel} data-testid="ai-assessment-panel">
      <div className={styles.panel__header}>
        <h3 className={styles.panel__title}>
          Оценка отработки <AiBadge title="Локальный ИИ-контур оценки" />
        </h3>
        <span className={styles.panel__revision}>rev.{effectiveRevision}</span>
      </div>

      {assessmentState?.reasonCode === STANDALONE_AI_REASON ? (
        <p className={styles.panel__revision} data-testid="ai-standalone-note">
          {STANDALONE_AI_NOTE}
        </p>
      ) : null}

      <div className={styles.panel__statusRow}>
        <span className={[styles.statusBadge, STATUS_BADGE_CLASSES[effectiveStatus]].join(" ")}>
          {STATUS_TITLES[effectiveStatus]}
        </span>
        {isLoading && <span className={styles.panel__revision}>обновление…</span>}
      </div>

      <div className={styles.panel__axesGrid}>
        <div className={styles.axisCard}>
          <span className={styles.axisCard__label}>Время</span>
          <span className={styles.axisCard__value}>
            {effectiveAxes.timeScore != null ? effectiveAxes.timeScore : "—"}
          </span>
        </div>
        <div className={styles.axisCard}>
          <span className={styles.axisCard__label}>Форма</span>
          <span className={styles.axisCard__value}>
            {effectiveAxes.correctnessScore != null ? effectiveAxes.correctnessScore : "—"}
          </span>
        </div>
        <div className={styles.axisCard}>
          <span className={styles.axisCard__label}>Текст</span>
          <span className={styles.axisCard__value}>
            {effectiveAxes.grammarScore != null ? effectiveAxes.grammarScore : "—"}
          </span>
        </div>
        <div className={styles.axisCard}>
          <span className={styles.axisCard__label}>Смысл</span>
          <span className={styles.axisCard__value}>
            {effectiveAxes.semanticScore != null ? effectiveAxes.semanticScore : "—"}
          </span>
        </div>
      </div>

      <div className={styles.panel__totalScore}>
        <span className={styles.panel__totalScoreLabel}>Итоговый балл</span>
        <span className={styles.panel__totalScoreValue}>
          {effectiveTotalScore != null ? effectiveTotalScore : "—"}
        </span>
      </div>

      {effectiveStatus === "review_required" && (
        <div className={styles.disputeBox}>
          <h4 className={styles.disputeBox__title}>Требуется арбитраж преподавателя</h4>
          <p className={styles.disputeBox__note}>
            ИИ зафиксировал спорную семантику. Ваше решение зафиксирует итоговую оценку и пополнит
            калибровочную базу.
          </p>

          {reviewData && reviewData.semanticReviews.length > 0 && (
            <div className={styles.disputeList}>
              {reviewData.semanticReviews.map((item) => (
                <div key={item.id} className={styles.disputeItem}>
                  <div className={styles.disputeItem__field}>Поле: {item.fieldPath}</div>
                  <div className={styles.disputeItem__reason}>
                    Причина: {item.reason} ({item.explanation})
                  </div>
                  <label className={styles.disputeForm__label}>
                    Решение преподавателя:
                    <select
                      className={styles.disputeItem__select}
                      value={decisions[item.id] ?? item.decision}
                      onChange={(e) =>
                        handleDecisionChange(
                          item.id,
                          e.target.value as "equivalent" | "different" | "uncertain",
                        )
                      }
                    >
                      <option value="equivalent">Эквивалентно эталону (equivalent)</option>
                      <option value="different">Искажение смысла (different)</option>
                      <option value="uncertain">Неопределенно / нейтрально (uncertain)</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className={styles.disputeForm}>
            <label className={styles.disputeForm__label}>
              Итоговый балл (0..100):
              <input
                type="number"
                min={0}
                max={100}
                value={overrideScore}
                onChange={(e) => setOverrideScore(e.target.value)}
                className={styles.disputeForm__input}
              />
            </label>
            <label className={styles.disputeForm__label}>
              Обоснование решения:
              <textarea
                value={overrideComment}
                onChange={(e) => setOverrideComment(e.target.value)}
                placeholder="Укажите комментарий к оценке..."
                className={styles.disputeForm__textarea}
              />
            </label>
            {submitError && <p className={styles.errorText}>{submitError}</p>}
            {successMessage && <p className={styles.successText}>{successMessage}</p>}
            <button
              type="button"
              className={styles.disputeForm__submit}
              disabled={isPendingSubmit}
              onClick={handleResolve}
            >
              {isPendingSubmit ? "Сохранение…" : "Утвердить итоговую оценку"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
