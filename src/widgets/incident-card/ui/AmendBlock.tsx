import { StatementForm } from "@/features/statement-form";
import { Button } from "@/shared/ui";

import type { AmendControl } from "../model/types";

import styles from "./AmendBlock.module.css";

type AmendBlockProps = {
  amend: AmendControl;
  isLocked: boolean;
};

/**
 * Режим дополнения (Shift+F2, spec п. 11): «Описание со слов заявителя» + «Сохранить»; уведомления мок-блокировки
 * параллельного редактирования («Вы не можете вносить изменения» / о доступности карточки).
 */
export function AmendBlock({ amend, isLocked }: AmendBlockProps) {
  const isDisabled = amend.isBlocked || isLocked;
  return (
    <>
      {amend.notice ? (
        <p className={styles.amend__notice} role="alert" data-blocked={amend.isBlocked}>
          {amend.notice}
        </p>
      ) : null}
      {amend.isActive ? (
        <section className={styles.amend} aria-label="Дополнение карточки">
          <StatementForm
            label="Описание со слов заявителя"
            value={amend.description}
            onChange={amend.onDescriptionChange}
            disabled={isDisabled}
          >
            <Button
              size="sm"
              variant="blue"
              onClick={amend.onSave}
              disabled={isDisabled || !amend.description.trim()}
              title="Сохранить дополнение"
            >
              Сохранить
            </Button>
          </StatementForm>
        </section>
      ) : null}
    </>
  );
}
