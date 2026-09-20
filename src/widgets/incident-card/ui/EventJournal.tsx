import { parseJournal } from "../lib/parseJournal";
import type { JournalEntry } from "../lib/parseJournal";

import styles from "./EventJournal.module.css";

type EventJournalProps = {
  description: string;
  /** ВИС-карточка: меньше данных — пустой журнал с пометкой (памятка стр. 14). */
  isFromVis?: boolean;
  /** Записи, добавленные в тренажёре (режим дополнения), — в конец истории. */
  extraEntries?: JournalEntry[];
};

const ENTRY_SEPARATOR = " · ";

function toEntryLabel(entry: JournalEntry): string {
  return [entry.at, entry.author, entry.text].filter(Boolean).join(ENTRY_SEPARATOR);
}

/** «Журнал событий / описание»: «17.09.2026 11:13:19 · УМЦ О.п. · Пожар в квартире» (ДДС_image6); скролл. */
export function EventJournal({ description, isFromVis = false, extraEntries = [] }: EventJournalProps) {
  const entries = [...parseJournal(description), ...extraEntries];
  return (
    <section className={styles.journal} aria-label="Журнал событий / описание">
      {entries.length === 0 ? (
        <p className={styles.journal__empty}>{isFromVis ? "Нет данных (карточка из ВИС)" : "Записей нет"}</p>
      ) : (
        <ol className={styles.journal__list}>
          {entries.map((entry, index) => (
            <li
              key={`${entry.at ?? "text"}-${index}`}
              className={styles.journal__entry}
              aria-label={toEntryLabel(entry)}
            >
              {entry.at ? (
                <span className={styles.journal__head}>
                  <span>{entry.at}</span>
                  <span>{entry.author}</span>
                </span>
              ) : null}
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
