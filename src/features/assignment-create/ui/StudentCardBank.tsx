"use client";

import type { StudentCard, StudentCardDecision, StudentCardEtalon } from "@/shared/api";
import { formatDate } from "@/shared/lib";
import {
  Alert,
  EmptyState,
  ErrorState,
  Field,
  ServerRequiredState,
  Skeleton,
  Tag,
  useResource,
} from "@/shared/ui/platform";

import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import { DECISION_TITLES } from "../model/studentCards";
import type { StepErrors, WizardDraft } from "../model/types";
import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StudentCardBankProps = {
  api: AssignmentCreateApi;
  draft: WizardDraft;
  errors: StepErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
};

const DECISIONS: StudentCardDecision[] = ["accepted", "notAccepted"];

/**
 * Банк карточек обучающихся-112 (спека 011): преподаватель отбирает карточки в задание ДДС и подтверждает эталон —
 * какой первичный статус должна поставить ДДС и, для «Не принята», кому передана информация.
 */
export function StudentCardBank({ api, draft, errors, onChange }: StudentCardBankProps) {
  const { state, reload } = useResource(() => api.listStudentCards(), [api]);

  const toggle = (card: StudentCard, checked: boolean) => {
    const cardIds = draft.cardIds.filter((id) => id !== card.id);
    const studentCards = draft.studentCards.filter((item) => item.cardId !== card.id);
    onChange(
      checked
        ? { cardIds: [...cardIds, card.id], studentCards: [...studentCards, { ...card.proposed }] }
        : { cardIds, studentCards },
    );
  };

  const update = (cardId: string, change: Partial<StudentCardEtalon>) =>
    onChange({
      studentCards: draft.studentCards.map((item) =>
        item.cardId === cardId ? { ...item, ...change } : item,
      ),
    });

  return (
    <section className={styles.group} role="group" aria-label="Карточки обучающихся-112">
      <h3 className={styles.group__title}>Карточки обучающихся-112</h3>
      <p className={styles.step__note}>
        Карточки, сохранённые обучающимися-112 на заданиях. Отметьте карточку и подтвердите эталон: какой
        статус должна поставить ДДС.
      </p>
      {errors.studentCards ? (
        <Alert tone="danger" role="alert">
          {errors.studentCards}
        </Alert>
      ) : null}
      {state.status === "loading" ? <Skeleton label="Загрузка карточек обучающихся…" lines={3} /> : null}
      {state.status === "serverRequired" ? <ServerRequiredState onRetry={reload} /> : null}
      {state.status === "error" ? <ErrorState message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.data.length === 0 ? (
        <EmptyState
          title="Обучающиеся-112 ещё не сохраняли карточки"
          text="Карточка появится здесь после того, как обучающийся-112 сохранит её в задании режима 112."
        />
      ) : null}
      {state.status === "ready" && state.data.length > 0 ? (
        <div className={styles.list}>
          {state.data.map((card) => {
            const etalon = draft.studentCards.find((item) => item.cardId === card.id);
            return (
              <div key={card.id} className={styles.scenario}>
                <CheckRow checked={etalon !== undefined} onChange={(checked) => toggle(card, checked)}>
                  <strong>{card.id}</strong> · {card.group} · {card.authorName}
                  {card.registeredAt ? <Tag>{formatDate(card.registeredAt)}</Tag> : null}
                  <span className={styles.check__meta}> {card.summary}</span>
                </CheckRow>
                {etalon ? <EtalonEditor card={card} etalon={etalon} onUpdate={update} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function EtalonEditor({
  card,
  etalon,
  onUpdate,
}: {
  card: StudentCard;
  etalon: StudentCardEtalon;
  onUpdate: (cardId: string, change: Partial<StudentCardEtalon>) => void;
}) {
  const isProposed =
    etalon.expectedDecision === card.proposed.expectedDecision &&
    (etalon.expectedTransferTo ?? "") === (card.proposed.expectedTransferTo ?? "");
  const pick = (decision: StudentCardDecision) =>
    onUpdate(card.id, {
      expectedDecision: decision,
      expectedTransferTo:
        decision === "notAccepted"
          ? (etalon.expectedTransferTo ?? card.proposed.expectedTransferTo ?? "")
          : undefined,
    });
  return (
    <div className={styles.etalon}>
      <p className={styles.step__note}>
        По билету: {card.ticketServices.join(", ") || "—"} · выбрал обучающийся-112:{" "}
        {card.selectedServices.join(", ") || "—"}
      </p>
      <div className={styles.inline} role="radiogroup" aria-label={`Эталон ДДС (${card.id})`}>
        {DECISIONS.map((decision) => (
          <CheckRow
            key={decision}
            type="radio"
            checked={etalon.expectedDecision === decision}
            onChange={() => pick(decision)}
          >
            {DECISION_TITLES[decision]}
            <span className="visually-hidden"> ({card.id})</span>
          </CheckRow>
        ))}
        <Tag tone={isProposed ? "info" : "warning"}>{isProposed ? "предложено системой" : "изменено"}</Tag>
      </div>
      {etalon.expectedDecision === "notAccepted" ? (
        <Field
          label="Кому передана информация"
          aria-label={`Кому передана информация (${card.id})`}
          value={etalon.expectedTransferTo ?? ""}
          onChange={(event) => onUpdate(card.id, { expectedTransferTo: event.target.value })}
        />
      ) : null}
    </div>
  );
}
