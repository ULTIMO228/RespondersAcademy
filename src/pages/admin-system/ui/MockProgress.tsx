import styles from "./MockProgress.module.css";

type MockProgressProps = {
  label: string;
  progress: number;
};

/** Полоса мок-прогресса операции. */
export function MockProgress({ label, progress }: MockProgressProps) {
  return (
    <div className={styles.progress}>
      <div
        className={styles.progress__track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span className={styles.progress__fill} style={{ width: `${progress}%` }} />
      </div>
      <span className={styles.progress__label}>
        {label}: {progress}%
      </span>
    </div>
  );
}
