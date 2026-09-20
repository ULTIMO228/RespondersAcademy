import { NumberField } from "./NumberField";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepTimingProps = {
  reactionSec: number;
  processingSec: number;
  maxGrammarErrors: number;
  onReactionChange: (value: number) => void;
  onProcessingChange: (value: number) => void;
  onGrammarChange: (value: number) => void;
};

const MIN_SEC = 1;
const MIN_ERRORS = 0;
const NORM_ERROR = "Норматив в секундах, больше 0";

/** Шаг 6. Тайминги и критерии: два раздельных норматива (Q&A в6), наследуются из сценариев. */
export function StepTiming(props: StepTimingProps) {
  const { reactionSec, processingSec, maxGrammarErrors } = props;
  const { onReactionChange, onProcessingChange, onGrammarChange } = props;
  return (
    <WizardStep index={6} title="Тайминги и критерии" hint="наследуются из сценариев, можно переопределить">
      <div className={styles.wizard__fields}>
        <NumberField
          label="Норматив первичной реакции, сек"
          value={reactionSec}
          min={MIN_SEC}
          errorText={NORM_ERROR}
          hint="по умолчанию 30 сек — от поступления до «Принята»"
          onCommit={onReactionChange}
        />
        <NumberField
          label="Норматив полной отработки, сек"
          value={processingSec}
          min={MIN_SEC}
          errorText={NORM_ERROR}
          hint="по умолчанию 180 сек — до «Работы завершены»"
          onCommit={onProcessingChange}
        />
        <NumberField
          label="Порог грамматических ошибок"
          value={maxGrammarErrors}
          min={MIN_ERRORS}
          errorText="Порог — целое число не меньше 0"
          hint="из критериев успешности сценариев"
          onCommit={onGrammarChange}
        />
      </div>
      <p className={styles.wizard__note}>
        Два раздельных норматива: первичная реакция и полная отработка карточки. В ТЗ §8 дефолт 30 сек назван
        «таймингом выполнения заданий» — в тренажёре это норматив первичной реакции (Q&A в6).
      </p>
    </WizardStep>
  );
}
