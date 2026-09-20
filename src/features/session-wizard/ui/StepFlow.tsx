import { Toggle } from "@/shared/ui";

import { NumberField } from "./NumberField";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepFlowProps = {
  paceSec: number;
  isConveyor: boolean;
  onPaceChange: (value: number) => void;
  onConveyorChange: (isConveyor: boolean) => void;
};

const MIN_PACE_SEC = 1;

/** Шаг 7. Поток карточек: темп выдачи (многозадачность, Q&A в6) и бесконечный конвейер (сценарий В). */
export function StepFlow({ paceSec, isConveyor, onPaceChange, onConveyorChange }: StepFlowProps) {
  return (
    <WizardStep index={7} title="Поток карточек">
      <div className={styles.wizard__fields}>
        <NumberField
          label="Новая карточка через N сек после начала отработки предыдущей"
          value={paceSec}
          min={MIN_PACE_SEC}
          errorText="Темп в секундах, больше 0"
          hint="темп выдачи: многозадачность курсанта"
          onCommit={onPaceChange}
        />
      </div>
      <Toggle
        label="Бесконечный конвейер до ручной остановки (сценарий В)"
        checked={isConveyor}
        onChange={onConveyorChange}
      />
    </WizardStep>
  );
}
