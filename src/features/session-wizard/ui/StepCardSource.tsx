import { CARD_SOURCE_TITLES } from "@/entities/session";
import type { CardSource } from "@/entities/session";

import { CARD_SOURCE_HINTS } from "../config/wizard";
import type { PoolCard } from "../model/types";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepCardSourceProps = {
  value: CardSource;
  pool: PoolCard[];
  onChange: (value: CardSource) => void;
};

const SOURCES = Object.keys(CARD_SOURCE_TITLES) as CardSource[];
/** Режимы, которым нужен пул карточек, заполненных курсантами. */
const POOL_SOURCES: CardSource[] = ["studentCreated", "mixed"];

/** Шаг 3. Категория вопросов (Session.cardSource, сценарий В ТЗ §10) + пул studentCreated с авторами. */
export function StepCardSource({ value, pool, onChange }: StepCardSourceProps) {
  const isPoolEmpty = pool.length === 0;
  const isPoolVisible = POOL_SOURCES.includes(value);
  return (
    <WizardStep index={3} title="Категория вопросов">
      <div className={styles.wizard__radios} role="radiogroup" aria-label="Категория вопросов">
        {SOURCES.map((source) => {
          const isDisabled = isPoolEmpty && POOL_SOURCES.includes(source);
          return (
            <label key={source} className={styles.wizard__radio}>
              <input
                type="radio"
                name="cardSource"
                checked={value === source}
                disabled={isDisabled}
                onChange={() => onChange(source)}
              />
              <span className={styles.wizard__radioTitle}>{CARD_SOURCE_TITLES[source]}</span>
              <span className={styles.wizard__muted}>
                {isDisabled
                  ? "пул пуст: курсанты ещё не заполняли карточки на занятиях"
                  : CARD_SOURCE_HINTS[source]}
              </span>
            </label>
          );
        })}
      </div>
      {isPoolVisible && !isPoolEmpty ? (
        <section className={styles.wizard__pool} aria-label="Пул карточек обучающихся">
          <p>
            Пул «сформированные обучающимися»: <b>{pool.length}</b> карточек
          </p>
          <table className={styles.wizard__table}>
            <thead>
              <tr>
                <th scope="col">Происшествие</th>
                <th scope="col">Тип</th>
                <th scope="col">Автор (createdByStudentId)</th>
                <th scope="col">Занятие</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((card) => (
                <tr key={card.id}>
                  <td>{card.cardNumber}</td>
                  <td>{card.cardType}</td>
                  <td>{card.authorName}</td>
                  <td>{card.sessionDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </WizardStep>
  );
}
