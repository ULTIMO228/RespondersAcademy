import styles from "./AiBadge.module.css";

type AiBadgeProps = {
  title?: string;
};

/** Ненавязчивая пометка контента, сгенерированного/оценённого ИИ (spec/07 «Бейдж ИИ»). */
export function AiBadge({
  title = "Сгенерировано ИИ-модулем, доступна ручная правка преподавателем",
}: AiBadgeProps) {
  return (
    <span className={styles.badge} title={title} aria-label={`ИИ: ${title}`}>
      ИИ
    </span>
  );
}
