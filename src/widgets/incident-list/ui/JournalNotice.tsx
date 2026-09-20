import { ArmIcon } from "@/shared/ui";

import styles from "./IncidentJournal.module.css";

type JournalNoticeProps = {
  text: string;
  tone?: "info" | "alert";
  onClose?: () => void;
};

const ICON_WIDTH = 31;
const ICON_HEIGHT = 29;

/** Плашка ленты над списком (стиль «Автообновление отключено…»): уведомления, офлайн, подсказки. */
export function JournalNotice({ text, tone = "info", onClose }: JournalNoticeProps) {
  return (
    <p className={styles.journal__banner} role={tone === "alert" ? "alert" : "status"}>
      <ArmIcon name="notification" width={ICON_WIDTH} height={ICON_HEIGHT} />
      <span className={styles["journal__banner-text"]}>{text}</span>
      {onClose ? (
        <button
          type="button"
          className={styles["journal__banner-close"]}
          aria-label="Скрыть уведомление"
          title="Скрыть (Esc)"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      ) : null}
    </p>
  );
}
