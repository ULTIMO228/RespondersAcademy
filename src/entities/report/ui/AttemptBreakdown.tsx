import { AiBadge } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";

import { MISTAKE_CATEGORY_TITLES } from "../config/evaluation";
import type { AttemptView } from "../model/attempt";
import { SeverityMark } from "./SeverityMark";

import styles from "./AttemptBreakdown.module.css";

type AttemptBreakdownProps = {
  attempt: AttemptView;
};

/** Разбор Evaluation: баллы по критериям, ошибки, комментарий ИИ, правка преподавателя. */
export function AttemptBreakdown({ attempt }: AttemptBreakdownProps) {
  const { teacherOverride } = attempt;
  return (
    <div className={styles.breakdown}>
      <section className={styles.breakdown__block} aria-label="Баллы по критериям">
        <h3 className={styles.breakdown__title}>
          Баллы по критериям <AiBadge title="Оценка выставлена ИИ-модулем (мок)" />
        </h3>
        <dl className={styles.breakdown__criteria}>
          {attempt.criteria.map((criterion) => (
            <div key={criterion.key} className={styles.breakdown__criterion}>
              <dt>{criterion.title}</dt>
              <dd>{criterion.score}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.breakdown__block} aria-label="Ошибки">
        <h3 className={styles.breakdown__title}>Ошибки</h3>
        {attempt.mistakes.length === 0 && attempt.grammarErrors.length === 0 ? (
          <p className={styles.breakdown__muted}>Ошибок не зафиксировано</p>
        ) : (
          <ul className={styles.breakdown__list}>
            {attempt.mistakes.map((mistake) => (
              <li key={mistake.message} data-severity={mistake.severity ?? undefined}>
                <b>{MISTAKE_CATEGORY_TITLES[mistake.category]}</b>{" "}
                {mistake.severity ? (
                  <SeverityMark severity={mistake.severity} />
                ) : (
                  `(${mistake.severityTitle})`
                )}
                : {mistake.message}
              </li>
            ))}
            {attempt.grammarErrors.map((error) => (
              <li key={error.fragment}>
                <b>{MISTAKE_CATEGORY_TITLES.grammar}</b>: «{error.fragment}» — «{error.wrong}» → «
                {error.expected}»
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={[styles.breakdown__note, styles["breakdown__note--ai"]].join(" ")}>
        <h3 className={styles.breakdown__title}>
          Комментарий <AiBadge />
        </h3>
        <p>{attempt.aiComment}</p>
      </section>
      {teacherOverride ? (
        <section
          className={[styles.breakdown__note, styles["breakdown__note--teacher"]].join(" ")}
          data-testid="teacher-override"
        >
          <h3 className={styles.breakdown__title}>
            Правка преподавателя · балл {teacherOverride.score}
            <span className={styles.breakdown__meta}>
              {teacherOverride.by}, {formatDateTime(teacherOverride.at)}
            </span>
          </h3>
          <p>{teacherOverride.comment}</p>
        </section>
      ) : (
        <p className={styles.breakdown__muted}>Правка преподавателя не вносилась — действует оценка ИИ.</p>
      )}
    </div>
  );
}
