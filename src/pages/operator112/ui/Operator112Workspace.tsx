"use client";

import { useEffect, useRef, useState } from "react";

import { Operator112AddressField } from "@/features/operator112-address";
import { Operator112Questionnaire } from "@/features/operator112-questionnaire";
import type { QuestionnaireValue } from "@/features/operator112-questionnaire";
import {
  canEdit,
  examRemainingSec,
  formatClock,
  isHintDue,
  pickHintStep,
  processingWait,
  resolveNorms,
  resolveTimeLimitSec,
} from "@/entities/operator112-attempt";
import type { HintProgress } from "@/entities/operator112-attempt";
import { Operator112Softphone } from "@/widgets/operator112-softphone";
import type {
  AssignmentDetail,
  CardDraft,
  CardDraftAddress,
  ClassifierEntry,
  NotificationListResponse,
  OperatorAttempt,
  OperatorEventRequest,
} from "@/shared/api";
import { Button, Input, TimerBadge } from "@/shared/ui";

import { FIELD, restoreForm, toCardDraft } from "../model/draft";
import type { DraftForm, FormErrors } from "../model/draft";
import { useFieldEvents } from "../model/useFieldEvents";

import styles from "./Operator112.module.css";

type Operator112WorkspaceProps = {
  assignment: AssignmentDetail;
  attempt: OperatorAttempt;
  entries: ClassifierEntry[];
  nowMs: number;
  isAnswering: boolean;
  answerError: string | null;
  isSubmitting: boolean;
  errors: FormErrors;
  sendEvent: (event: OperatorEventRequest) => Promise<unknown>;
  onAnswer: () => void;
  onSubmit: (draft: CardDraft, examZero: boolean) => void;
};

const DESCRIPTION_LIMIT = 1999;
const LOCKED_NOTE = "Сначала примите вызов — поля карточки станут доступны";

/** Рабочее место специалиста-112: софтфон, заявитель, адрес, описание, опросная карта, флаги, передача карточки. */
export function Operator112Workspace({
  assignment,
  attempt,
  entries,
  nowMs,
  isAnswering,
  answerError,
  isSubmitting,
  errors,
  sendEvent,
  onAnswer,
  onSubmit,
}: Operator112WorkspaceProps) {
  const norms = resolveNorms(assignment.params);
  const limitSec = resolveTimeLimitSec(assignment.params);
  const [form, setForm] = useState<DraftForm>(() => restoreForm(attempt.events));
  const [refreshToken, setRefreshToken] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const events = useFieldEvents(sendEvent, setNotice);
  const editable = canEdit(attempt) && !isSubmitting;
  const remaining = examRemainingSec(attempt, limitSec, nowMs);
  const processing = processingWait(attempt, norms.submitSec, nowMs);

  const patch = (changes: Partial<DraftForm>) => setForm((current) => ({ ...current, ...changes }));
  const text =
    (
      key:
        "applicantName" | "applicantStatus" | "phoneProvided" | "phoneOnSite" | "description" | "pollAnswers",
      field: string,
    ) =>
    (value: string) => {
      patch({ [key]: value });
      events.queue(field, value);
    };

  const changeAddress = (next: CardDraftAddress) => {
    const previous = form.address;
    patch({ address: next });
    (["street", "house", "okrug", "raion", "descriptive", "source"] as const).forEach((key) => {
      if (previous[key] !== next[key]) {
        events.queue(key === "source" ? FIELD.addressSource : FIELD[key], next[key]);
      }
    });
  };

  /** Флаги уходят событием сразу, без задержки: от них зависит расчёт условных служб оповещения на сервере. */
  const toggle =
    (key: "injured" | "ambulanceRefused" | "blocked" | "chs" | "chp", field: string, recalc: boolean) =>
    (checked: boolean) => {
      patch({ [key]: checked });
      sendEvent({ type: "fieldChanged", payload: { field, value: checked } })
        .then(() => {
          if (recalc) setRefreshToken((token) => token + 1);
        })
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : "Не удалось сохранить флаг"),
        );
    };

  const changeQuestionnaire = (value: QuestionnaireValue, list: NotificationListResponse | null) => {
    setForm((current) => ({
      ...current,
      signs: value.signs,
      finalType: value.finalType,
      classifierCode: value.classifierCode,
      notifications: list ? list.services : value.signs.length === 0 ? [] : current.notifications,
    }));
  };

  // Подсказка тренировки: после idleSec без действий показывается первый невыполненный шаг, сервер получает hintShown.
  const lastActivity = useRef(nowMs);
  const shownHint = useRef<string | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const progress: HintProgress = {
    answered: attempt.state !== "ringing",
    applicant: Boolean(form.applicantName.trim()),
    address: Boolean(form.address.street.trim() || form.address.descriptive.trim()),
    description: Boolean(form.description.trim()),
    poll: form.signs.length > 0,
    signs: form.signs.length > 0,
    notification: form.notifications.length > 0,
  };
  const activityKey = JSON.stringify([attempt.state, form]);
  useEffect(() => {
    lastActivity.current = Date.now();
    shownHint.current = null;
    setHintText(null);
  }, [activityKey]);
  useEffect(() => {
    if (!attempt.hints || !isHintDue(attempt, lastActivity.current, nowMs)) return;
    const step = pickHintStep(attempt.hints.steps, progress);
    if (!step || shownHint.current === step.stage) return;
    shownHint.current = step.stage;
    setHintText(step.text);
    void sendEvent({ type: "hintShown", payload: { stage: step.stage } }).catch(() => undefined);
    // Подсказка привязана к таймеру простоя; progress пересчитывается вместе с формой и сбрасывает активность выше.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs]);

  const submit = () => {
    events.flush();
    onSubmit(toCardDraft(form, attempt.aon), remaining === 0);
  };

  return (
    <div className={styles.work} data-state={attempt.state}>
      <header className={styles.work__bar}>
        <div>
          <h1 className={styles.work__title}>Режим «Специалист-112»</h1>
          <p className={styles.work__subtitle}>
            {assignment.title || "Задание"} · {assignment.format === "exam" ? "экзамен" : "тренировка"}
          </p>
        </div>
        <div className={styles.work__timers}>
          {remaining !== null ? (
            <TimerBadge value={formatClock(remaining)} exceeded={remaining === 0} caption="лимит на билет" />
          ) : null}
          <TimerBadge
            value={formatClock(processing.elapsedSec)}
            exceeded={processing.exceeded}
            caption={`отработка, норматив ${formatClock(norms.submitSec)}`}
          />
        </div>
      </header>

      {hintText ? (
        <aside className={styles.work__hint} aria-label="Подсказка" aria-live="polite">
          {hintText}
        </aside>
      ) : null}
      {notice ? (
        <p className={styles.work__notice} role="status">
          {notice}
        </p>
      ) : null}

      <div className={styles.work__grid}>
        <div className={styles.work__column}>
          <Operator112Softphone
            attempt={attempt}
            format={assignment.format}
            norms={norms}
            nowMs={nowMs}
            isAnswering={isAnswering}
            onAnswer={onAnswer}
            onReplay={
              assignment.format === "exam"
                ? undefined
                : () => void sendEvent({ type: "replay" }).catch(() => undefined)
            }
          />
          {answerError ? (
            <p className={styles.work__error} role="alert">
              {answerError}
            </p>
          ) : null}

          <fieldset className={styles.work__panel} disabled={!editable}>
            <legend className={styles.work__legend}>Заявитель</legend>
            {!canEdit(attempt) && attempt.state === "ringing" ? (
              <p className={styles.work__note}>{LOCKED_NOTE}</p>
            ) : null}
            <Input
              label="ФИО"
              value={form.applicantName}
              onChange={(e) => text("applicantName", FIELD.applicantName)(e.target.value)}
            />
            <Input
              label="Статус заявителя"
              value={form.applicantStatus}
              placeholder="очевидец, пострадавший…"
              onChange={(e) => text("applicantStatus", FIELD.applicantStatus)(e.target.value)}
            />
            <Input label="АОН" value={attempt.aon} readOnly />
            <Input
              label="Предоставленный телефон"
              value={form.phoneProvided}
              onChange={(e) => text("phoneProvided", FIELD.phoneProvided)(e.target.value)}
            />
            <Input
              label="Телефон на месте"
              value={form.phoneOnSite}
              onChange={(e) => text("phoneOnSite", FIELD.phoneOnSite)(e.target.value)}
            />
          </fieldset>

          <fieldset className={styles.work__panel} disabled={!editable}>
            <legend className={styles.work__legend}>Со слов заявителя</legend>
            <label className={styles.work__label} htmlFor="operator112-description">
              Описание
            </label>
            <textarea
              id="operator112-description"
              className={styles.work__textarea}
              value={form.description}
              maxLength={DESCRIPTION_LIMIT}
              rows={6}
              aria-invalid={Boolean(errors.description)}
              onChange={(e) => text("description", FIELD.description)(e.target.value)}
            />
            <span className={styles.work__counter}>
              {form.description.length} / {DESCRIPTION_LIMIT}
            </span>
            {errors.description ? (
              <p className={styles.work__error} role="alert">
                {errors.description}
              </p>
            ) : null}
          </fieldset>
        </div>

        <div className={styles.work__column}>
          <Operator112AddressField
            value={form.address}
            onChange={changeAddress}
            disabled={!editable}
            error={errors.address}
          />
          <Operator112Questionnaire
            key={attempt.id}
            attemptId={attempt.id}
            entries={entries}
            initialSigns={form.signs}
            disabled={!editable}
            refreshToken={refreshToken}
            onChange={changeQuestionnaire}
          />
          <fieldset className={styles.work__panel} disabled={!editable}>
            <legend className={styles.work__legend}>Признаки карточки</legend>
            <div className={styles.work__flags}>
              <label>
                <input
                  type="checkbox"
                  checked={form.injured}
                  onChange={(e) => toggle("injured", FIELD.injured, true)(e.target.checked)}
                />{" "}
                Пострадавшие
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.ambulanceRefused}
                  onChange={(e) =>
                    toggle("ambulanceRefused", FIELD.ambulanceRefused, false)(e.target.checked)
                  }
                />{" "}
                Отказ от скорой
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.blocked}
                  onChange={(e) => toggle("blocked", FIELD.blocked, true)(e.target.checked)}
                />{" "}
                Заблокированные
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.chs}
                  onChange={(e) => toggle("chs", FIELD.chs, false)(e.target.checked)}
                />{" "}
                ЧС
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.chp}
                  onChange={(e) => toggle("chp", FIELD.chp, false)(e.target.checked)}
                />{" "}
                ЧП
              </label>
            </div>
          </fieldset>
        </div>
      </div>

      <footer className={styles.work__footer}>
        {errors.general ? (
          <p className={styles.work__error} role="alert">
            {errors.general}
          </p>
        ) : null}
        <Button variant="primary" size="lg" disabled={!editable} onClick={submit}>
          {isSubmitting ? "Передача…" : "Передать карточку"}
        </Button>
      </footer>
    </div>
  );
}
