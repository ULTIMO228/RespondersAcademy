import type { Evaluation } from "@/shared/api";
import { AiBadge } from "@/shared/ui";

import styles from "./AttemptResult.module.css";

/** Разбор ошибок мок-оценки: грамматика (фрагмент → исправление), прочие ошибки, комментарий ИИ. */
export function EvaluationDetails({ evaluation }: { evaluation: Evaluation }) {
  const { grammarErrors, errors, aiComment, teacherOverride } = evaluation;
  return (
    <div className={styles.result__details}>
      <h3 className={styles.result__subtitle}>Разбор ошибок</h3>
      {grammarErrors.length === 0 && errors.length === 0 ? (
        <p className={styles.result__note}>Ошибок не найдено</p>
      ) : (
        <ul className={styles.result__errors}>
          {grammarErrors.map((error, index) => (
            <li key={`grammar-${index}`}>
              Грамматика: «{error.wrong}» → «{error.expected}» ({error.fragment})
            </li>
          ))}
          {errors.map((error, index) => (
            <li key={`error-${index}`} data-severity={error.severity}>
              {error.message}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.result__comment}>
        <AiBadge /> {aiComment}
      </p>
      {teacherOverride ? (
        <p className={styles.result__note}>
          Оценка преподавателя: {teacherOverride.score} — {teacherOverride.comment}
        </p>
      ) : null}
    </div>
  );
}
