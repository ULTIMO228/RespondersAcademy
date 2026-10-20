import type { OperatorAttempt } from "@/shared/api";

import styles from "./Operator112Mirror.module.css";

type Operator112MirrorProps = {
  /** Попытка 112 курсанта; null — данных нет (у преподавателя нет отдельного канала чтения попыток 112). */
  attempt: OperatorAttempt | null;
};

/** Состояние попытки словами для подписи зеркала. */
const STATE_TITLES: Record<OperatorAttempt["state"], string> = {
  ringing: "вызов поступил, не принят",
  answered: "вызов принят, идёт заполнение карточки",
  submitted: "карточка сохранена",
};

/** Последнее значение каждого поля из событий fieldChanged (имена полей — как у рабочего места 112). */
function lastFieldValues(attempt: OperatorAttempt): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  attempt.events.forEach((event) => {
    if (event.type !== "fieldChanged") return;
    const field = event.payload.field;
    if (typeof field === "string") values[field] = event.payload.value;
  });
  return values;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Read-only зеркало рабочего места специалиста 112 (FR-015): те же разделы, что у курсанта (заявитель, адрес,
 * описание, признаки), но все контролы заблокированы. Значения — только из событий попытки; ничего не додумывается.
 */
export function Operator112Mirror({ attempt }: Operator112MirrorProps) {
  const values = attempt ? lastFieldValues(attempt) : {};
  const field = (label: string, name: string, fallback = "") => (
    <label className={styles.mirror__field}>
      <span>{label}</span>
      <input type="text" readOnly value={text(values[name]) || fallback} />
    </label>
  );
  const flag = (label: string, name: string) => (
    <label className={styles.mirror__flag}>
      <input type="checkbox" readOnly checked={values[name] === true} onChange={() => undefined} /> {label}
    </label>
  );
  return (
    <fieldset className={styles.mirror} disabled aria-label="Рабочее место: Специалист 112 — только просмотр">
      <legend className="visually-hidden">Рабочее место специалиста 112 (только просмотр)</legend>
      {attempt ? (
        <>
          <p className={styles.mirror__state}>
            Карточка {attempt.incidentNumber} · {STATE_TITLES[attempt.state]}
          </p>
          <div className={styles.mirror__grid}>
            <section className={styles.mirror__panel}>
              <h2 className={styles.mirror__title}>Заявитель</h2>
              {field("ФИО", "applicant.name")}
              {field("Статус заявителя", "applicant.status")}
              {field("АОН", "", attempt.aon)}
              {field("Предоставленный телефон", "phones.provided")}
              {field("Телефон на месте", "phones.onSite")}
            </section>
            <section className={styles.mirror__panel}>
              <h2 className={styles.mirror__title}>Адрес</h2>
              {field("Улица", "address.street")}
              {field("Дом", "address.house")}
              {field("Округ", "address.okrug")}
              {field("Район", "address.raion")}
              {field("Ориентиры", "address.descriptive")}
            </section>
            <section className={styles.mirror__panel}>
              <h2 className={styles.mirror__title}>Со слов заявителя</h2>
              <label className={styles.mirror__field}>
                <span>Описание</span>
                <textarea readOnly rows={5} value={text(values.description)} />
              </label>
              {field("Ответы опросной карты", "what.pollAnswers")}
            </section>
            <section className={styles.mirror__panel}>
              <h2 className={styles.mirror__title}>Признаки карточки</h2>
              {flag("Пострадавшие", "what.casualties.injured")}
              {flag("Отказ от скорой", "what.casualties.ambulanceRefused")}
              {flag("Заблокированные", "what.casualties.blocked")}
              {flag("ЧС", "emergency.chs")}
              {flag("ЧП", "emergency.chp")}
            </section>
          </div>
        </>
      ) : (
        <p className={styles.mirror__empty} role="status">
          Нет данных попытки 112: курсант ещё не принял вызов, либо сервер не отдаёт преподавателю ход попытки
          112 (отдельного канала чтения нет).
        </p>
      )}
    </fieldset>
  );
}
