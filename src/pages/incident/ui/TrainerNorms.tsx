import { SimulatorBarSlot } from "@/widgets/simulator-bar";
import { formatDuration } from "@/shared/lib";

import styles from "./TrainerNorms.module.css";

type TrainerNormsProps = {
  /** Первичная реакция попытки («Принята» / «Не принята»), мс. */
  reactionMs: number;
  reactionNormMs: number;
  isReactionExceeded: boolean;
  /** Тикающий таймер отработки от открытия карточки. */
  processingValue: string;
  processingNormMs: number;
  isProcessingExceeded: boolean;
};

/**
 * Нормативы карточки ДДС (реакция 30 с, отработка 3 мин) в полосе тренажёра: в окне АРМ-112 ДДС таймера нет
 * (памятка стр. 23), поэтому учебный отсчёт вынесен из шапки карточки (спека 012, FR-002).
 */
export function TrainerNorms(props: TrainerNormsProps) {
  const { reactionMs, reactionNormMs, isReactionExceeded } = props;
  const { processingValue, processingNormMs, isProcessingExceeded } = props;
  return (
    <SimulatorBarSlot>
      <span className={styles.norms} data-testid="trainer-norms">
        <span className={styles.norms__item} data-exceeded={isReactionExceeded}>
          Реакция {formatDuration(reactionMs)} · норматив {formatDuration(reactionNormMs)}
        </span>
        <span className={styles.norms__item} role="timer" data-exceeded={isProcessingExceeded}>
          Отработка {processingValue} · норматив {formatDuration(processingNormMs)}
        </span>
      </span>
    </SimulatorBarSlot>
  );
}
