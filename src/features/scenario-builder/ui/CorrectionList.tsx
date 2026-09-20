import { AiBadge, StatusChip } from "@/shared/ui";

import styles from "./ScenarioEditor.module.css";

type CorrectionListProps = {
  /** Scenario.validation.comment — сохранённый комментарий коррекции (виден после перезагрузки). */
  comment?: string;
  author: string;
};

/** Комментарий коррекции: статус «на проверке» и пометка об исправленном мок-варианте от системы. */
export function CorrectionList({ comment, author }: CorrectionListProps) {
  if (!comment) return null;
  return (
    <ul className={styles.editor__corrections} aria-label="Комментарии коррекции">
      <li>
        <b>{author}</b>: «{comment}» — <StatusChip label="на проверке" tone="created" />
        <span className={styles.editor__muted}>
          {" "}
          <AiBadge /> повторная генерация выдала исправленный вариант (мок)
        </span>
      </li>
    </ul>
  );
}
