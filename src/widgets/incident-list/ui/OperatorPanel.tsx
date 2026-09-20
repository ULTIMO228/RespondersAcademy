import { LogoutLink } from "@/entities/user";
import { ArmIcon } from "@/shared/ui";

import { buildJournalClock } from "../lib/clock";
import type { JournalOperator } from "../model/types";
import { ArmNavTabs } from "./ArmNavTabs";
import styles from "./OperatorPanel.module.css";

type OperatorPanelProps = {
  operator: JournalOperator;
  /** «Сейчас» ленты (тик 1 сек). */
  nowMs: number;
};

const TOP_ICON_HEIGHT = 25;

/** Тёмный блок справа: дата, оператор и АРМ, иконки, крупные часы, вкладки разделов (p12_Image66, ДДС_image4). */
export function OperatorPanel({ operator, nowMs }: OperatorPanelProps) {
  const clock = buildJournalClock(nowMs);
  return (
    <aside className={styles["operator-panel"]} aria-label="Рабочее место оператора">
      <div className={styles["operator-panel__top"]}>
        <div className={styles["operator-panel__info"]}>
          <strong className={styles["operator-panel__date"]}>{clock.dateLabel}</strong>
          <span className={styles["operator-panel__user"]}>
            {operator.operatorLabel}
            <ArmIcon name="top-monitor" height={TOP_ICON_HEIGHT} />
            {operator.armLabel}
            <button
              type="button"
              className={styles["operator-panel__icon-button"]}
              aria-label="Настройки"
              title="Настройки"
            >
              <ArmIcon name="top-settings" height={TOP_ICON_HEIGHT} />
            </button>
            <button
              type="button"
              className={styles["operator-panel__icon-button"]}
              aria-label="Сообщить о проблеме"
              title="Сообщить о проблеме в СТП"
            >
              <ArmIcon name="top-info" height={TOP_ICON_HEIGHT} />
            </button>
            <LogoutLink className={styles["operator-panel__icon-button"]} aria-label="Выход" title="Выход">
              <ArmIcon name="top-exit" height={TOP_ICON_HEIGHT} />
            </LogoutLink>
          </span>
        </div>
        <time className={styles["operator-panel__clock"]} dateTime={clock.iso}>
          {clock.hourMinute}
          <sup>:{clock.seconds}</sup>
        </time>
      </div>
      <ArmNavTabs />
    </aside>
  );
}
