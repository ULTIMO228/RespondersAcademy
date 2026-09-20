import { SEVERITY_RULES, SEVERITY_TITLES } from "@/entities/report";
import { AiBadge } from "@/shared/ui";

import type { AttemptView, IssueView } from "../model/types";
import { AttemptCalls } from "./AttemptCalls";

import styles from "./ReportSession.module.css";

type AttemptCardProps = {
  attempt: AttemptView;
  issues: IssueView[];
};

function IssueRow({ issue }: { issue: IssueView }) {
  return (
    <tr data-severity={issue.severity}>
      <td>
        <span
          className={[styles.report__severity, styles[`report__severity--${issue.severity}`]].join(" ")}
          title={SEVERITY_RULES[issue.severity]}
        >
          {SEVERITY_TITLES[issue.severity]}
        </span>
      </td>
      <td>{issue.kind === "grammar" ? `грамматика: ${issue.grammarType}` : "ошибка действий"}</td>
      <td>{issue.field ?? "—"}</td>
      <td>
        {issue.kind === "grammar" ? (
          <>
            <del className={styles.report__wrong}>{issue.wrongFragment}</del> →{" "}
            <ins className={styles.report__right}>{issue.correctFragment}</ins>
          </>
        ) : (
          issue.message
        )}
      </td>
    </tr>
  );
}

/** Попытка: карточка, тайминги этапов с отклонениями, ошибки построчно, вызовы, расшифровка балла. */
export function AttemptCard({ attempt, issues }: AttemptCardProps) {
  return (
    <article className={styles.report__attempt} aria-label={`Попытка ${attempt.id}`}>
      <header className={styles.report__attemptHeader}>
        <b>{attempt.studentName}</b> · Происшествие {attempt.cardNumber} — {attempt.cardType}
        <span className={styles.report__attemptScore} data-attempt-score={attempt.finalTotal}>
          балл {attempt.finalTotal}
        </span>
      </header>
      <ol className={styles.report__stages}>
        {attempt.stages.map((stage) => (
          <li key={stage.id} className={stage.isExceeded ? styles["report__stage--bad"] : undefined}>
            <span className={styles.report__mono}>{stage.offset}</span> {stage.title}
            {stage.deviation ? ` (${stage.normText}, откл. ${stage.deviation})` : ""}
          </li>
        ))}
      </ol>
      {issues.length > 0 ? (
        <table className={styles.report__issues}>
          <thead>
            <tr>
              <th scope="col">Критичность</th>
              <th scope="col">Тип</th>
              <th scope="col">Поле</th>
              <th scope="col">Как написано → как правильно / описание</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.report__muted}>Ошибок выбранной критичности нет.</p>
      )}
      <AttemptCalls calls={attempt.calls} />
      <p className={styles.report__scores}>
        {attempt.scores.map((score) => (
          <span key={score.key}>
            {score.title}: <b>{score.value}</b>{" "}
            <span className={styles.report__muted}>(вес {score.weightPercent} %)</span>
          </span>
        ))}
        <span>
          Балл по весам: <b className={styles.report__mono}>{attempt.weightedTotal}</b>
        </span>
      </p>
      <p className={styles.report__ai}>
        <AiBadge /> {attempt.aiComment}
      </p>
    </article>
  );
}
