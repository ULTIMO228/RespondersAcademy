import styles from "./StatusChip.module.css";

export type StatusTone = "new" | "created" | "assigned" | "accepted" | "completed" | "closed" | "phoneOnly";

type StatusChipProps = {
  label: string;
  tone: StatusTone;
  /** «Добавлена»-маркер ПОВ-112: красная пиктограмма вместо кружка. */
  marker?: "dot" | "added";
  onDark?: boolean;
};

/** Маркер статуса с канонической палитрой АРМ ЕДДС (spec/07 «Цветовая семантика»). */
export function StatusChip({ label, tone, marker = "dot", onDark = false }: StatusChipProps) {
  return (
    <span className={[styles.chip, onDark ? styles["chip--on-dark"] : ""].join(" ")} data-tone={tone}>
      {marker === "added" ? (
        <img className={styles.chip__icon} src="/icons/service-status.svg" alt="" width={16} height={16} />
      ) : (
        <span className={[styles.chip__dot, styles[`chip__dot--${tone}`]].join(" ")} aria-hidden="true" />
      )}
      <span className={styles.chip__label}>{label}</span>
    </span>
  );
}
