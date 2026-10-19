import type { TrainingMode } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { LinkButton } from "@/shared/ui/platform";

import styles from "./AssignButton.module.css";

type AssignButtonProps = {
  /** Отображаемое название этапа: попадает в название задания и подсказку мастера. */
  stageTitle: string;
  mode: TrainingMode;
  /** Обучающиеся с ошибкой этапа; мастер сам проверит их по списку доступных. */
  studentIds: string[];
};

/**
 * Переход из карты ошибок в мастер назначения (спека 003, US2). Ссылка ведёт в мастер даже без обучающихся:
 * тогда состав выбирается вручную.
 */
export function AssignButton({ stageTitle, mode, studentIds }: AssignButtonProps) {
  const href = ROUTES.teacherAssignmentNewPrefilled({
    studentIds,
    mode,
    title: `Тренировка: ${stageTitle}`,
    focusStage: stageTitle,
  });
  return (
    <LinkButton href={href} className={styles.assign}>
      Назначить тренировку по этому этапу
    </LinkButton>
  );
}
