import styles from "./TimerBadge.module.css";

type TimerBadgeProps = {
  /** Статичное значение в волне 0 («0:30», «3:00»); тикающая логика — волна 2. */
  value: string;
  exceeded?: boolean;
  size?: "sm" | "lg";
  caption?: string;
};

/** Моноширинный таймер норматива; краснеет при превышении (--color-timer-exceeded). */
export function TimerBadge({ value, exceeded = false, size = "sm", caption }: TimerBadgeProps) {
  return (
    <span
      className={[styles.timer, styles[`timer--${size}`], exceeded ? styles["timer--exceeded"] : ""].join(
        " ",
      )}
      data-exceeded={exceeded}
      role="timer"
      aria-label={`${caption ?? "Таймер"}: ${value}${exceeded ? ", норматив превышен" : ""}`}
    >
      <span className={styles.timer__value}>{value}</span>
      {caption ? <span className={styles.timer__caption}>{caption}</span> : null}
    </span>
  );
}
