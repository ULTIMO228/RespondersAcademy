import styles from "./QuickChips.module.css";

type QuickChipsProps = {
  chips: string[];
  disabled: boolean;
  onPick: (text: string) => void;
};

/** Быстрые вопросы по ошибкам попытки: клик равен ручной отправке. */
export function QuickChips({ chips, disabled, onPick }: QuickChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className={styles.chips} role="group" aria-label="Быстрые вопросы">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          className={styles.chip}
          disabled={disabled}
          onClick={() => onPick(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
