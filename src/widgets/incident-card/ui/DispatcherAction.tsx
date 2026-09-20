import Link from "next/link";

import { StatementForm } from "@/features/statement-form";
import { Input } from "@/shared/ui";

import type { DispatcherControl } from "../model/types";
import { CardIcon } from "./CardIcon";

import styles from "./DispatcherAction.module.css";

type DispatcherActionProps = {
  readOnly?: boolean;
  /** Живой режим: управляемый ввод с буфером (T2.3-09). */
  control?: DispatcherControl;
  /** Карточка закрыта для редактирования / редактирует другой пользователь. */
  isDisabled?: boolean;
};

const ACTION_HINT = "Например: «Сообщение принято, дежурная бригада направлена на место»";

/** Тренажёрный блок «Действие диспетчера» (spec п. 5) в форме штатного «Описания со слов заявителя». */
export function DispatcherAction({ readOnly = false, control, isDisabled = false }: DispatcherActionProps) {
  return (
    <section className={styles.action}>
      <StatementForm
        label="Действие диспетчера"
        hint={ACTION_HINT}
        readOnly={readOnly}
        value={control?.text}
        onChange={control?.onTextChange}
        disabled={isDisabled}
        status={control?.status}
      >
        <Input
          label="Номер наряда"
          className={styles.action__duty}
          disabled={readOnly || isDisabled}
          value={control?.dutyNumber}
          onChange={control ? (event) => control.onDutyNumberChange(event.target.value) : undefined}
        />
        {control?.callHref && !readOnly ? (
          <Link
            href={control.callHref}
            className={styles.action__call}
            aria-label="Позвонить в службу (софтфон)"
            title="Позвонить в службу (софтфон)"
          >
            <CardIcon name="phone" size={20} />
          </Link>
        ) : null}
      </StatementForm>
    </section>
  );
}
