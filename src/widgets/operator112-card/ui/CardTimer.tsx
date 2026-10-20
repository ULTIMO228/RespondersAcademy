import styles from "./CardTimer.module.css";

type CardTimerProps = {
  /** Показание «ММ:СС» (минуты не ограничены 99). Считает вызывающий — компонент презентационный. */
  text: string;
  /** Красный фон блока после порога (спека 009, R7). */
  isRed: boolean;
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  return mod10 >= 2 && mod10 <= 4 ? few : many;
}

function spokenTime(text: string): string {
  const [min, sec] = text.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(min) || Number.isNaN(sec)) return text;
  return `${min} ${plural(min, "минута", "минуты", "минут")} ${sec} ${plural(sec, "секунда", "секунды", "секунд")}`;
}

/**
 * Таймер карточки ПОВ-112 (КАРТОЧКА_image1–2): белые цифры «ММ:СС», под ними «минут» и «секунд».
 * Краснеет только этот блок, шапка остаётся светлой; переход мгновенный.
 */
export function CardTimer({ text, isRed }: CardTimerProps) {
  return (
    <div
      className={[styles.timer, isRed ? styles["timer--red"] : ""].filter(Boolean).join(" ")}
      role="timer"
      aria-label={`Время работы с карточкой: ${spokenTime(text)}`}
    >
      <span className={styles.timer__clock}>{text}</span>
      <span className={styles.timer__units} aria-hidden="true">
        <span>минут</span>
        <span>секунд</span>
      </span>
    </div>
  );
}
