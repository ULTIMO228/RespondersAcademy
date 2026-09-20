import { PanelIcon } from "./PanelIcon";

import styles from "./ServicePanel.module.css";

type MyServiceActionsProps = {
  isHistoryOpen: boolean;
  onHistoryToggle: () => void;
  onStatusEdit?: () => void;
};

/** Иконки плитки «моей службы»: конверт — история, карандаш — смена статуса (p23_Image108). */
export function MyServiceActions({ isHistoryOpen, onHistoryToggle, onStatusEdit }: MyServiceActionsProps) {
  return (
    <>
      <button
        type="button"
        className={styles.panel__envelope}
        aria-expanded={isHistoryOpen}
        aria-label="История службы"
        title="История службы"
        onClick={onHistoryToggle}
      >
        <PanelIcon name="envelope" size={14} />
      </button>
      {onStatusEdit ? (
        <button
          type="button"
          className={styles.panel__pencil}
          aria-label="Сменить статус (Alt + E)"
          title="Сменить статус (Alt + E)"
          onClick={onStatusEdit}
        >
          <PanelIcon name="pencil" size={14} />
        </button>
      ) : null}
    </>
  );
}
