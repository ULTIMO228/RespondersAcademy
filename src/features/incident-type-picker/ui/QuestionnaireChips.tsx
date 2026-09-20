import { Chip } from "@/shared/ui";

import type { QuestionGroup } from "../model/questionGroups";

import styles from "./QuestionnaireChips.module.css";

type QuestionnaireChipsProps = {
  groups: QuestionGroup[];
  /** В режиме диспетчера ДДС опросная карта только для чтения. */
  readOnly?: boolean;
  /** Пометка пустой опросной карты (у ВИС-карточек анкеты может не быть). */
  emptyText?: string;
};

const DEFAULT_EMPTY_TEXT = "Опросная карта не заполнена";

/** Развёрнутая опросная карта (КАРТОЧКА_image2): вопросы слева серым, чипы справа, выбранные — синие. */
export function QuestionnaireChips({
  groups,
  readOnly = true,
  emptyText = DEFAULT_EMPTY_TEXT,
}: QuestionnaireChipsProps) {
  if (groups.length === 0) {
    return <p className={styles.chips__empty}>{emptyText}</p>;
  }
  return (
    <dl className={styles.chips}>
      {groups.map((group) => (
        <div key={group.question} className={styles.chips__group} role="group" aria-label={group.question}>
          <dt className={styles.chips__question}>{group.question}</dt>
          <dd className={styles.chips__options}>
            {group.options.map((option) => (
              <Chip key={option} selected={group.selected.includes(option)} disabled={readOnly}>
                {option}
              </Chip>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
