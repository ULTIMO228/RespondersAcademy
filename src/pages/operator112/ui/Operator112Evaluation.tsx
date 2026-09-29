import type { AssignmentFormat, FieldDiff, OperatorEvaluation } from "@/shared/api";
import { AiBadge, Table } from "@/shared/ui";
import type { TableColumn } from "@/shared/ui";

import styles from "./Operator112Evaluation.module.css";

type Operator112EvaluationProps = {
  evaluation: OperatorEvaluation;
  format: AssignmentFormat | null;
  /** Порог экзамена (params.passThreshold) — для пояснения к «сдал / не сдал». */
  passThreshold?: number;
};

const COMPONENTS: {
  key: keyof Pick<OperatorEvaluation, "timeScore" | "correctnessScore" | "grammarScore" | "semanticScore">;
  title: string;
}[] = [
  { key: "timeScore", title: "Время" },
  { key: "correctnessScore", title: "Корректность" },
  { key: "grammarScore", title: "Грамматика" },
  { key: "semanticScore", title: "Смысл" },
];

const SEVERITY_TITLES: Record<string, string> = {
  critical: "критичная",
  major: "существенная",
  minor: "незначительная",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function errorLine(error: Record<string, unknown>): string {
  const message = typeof error.message === "string" ? error.message : "";
  const severity = typeof error.severity === "string" ? SEVERITY_TITLES[error.severity] : undefined;
  return severity ? `${message} (${severity})` : message;
}

const DIFF_COLUMNS: TableColumn<FieldDiff>[] = [
  { key: "field", title: "Поле", render: (row) => row.field },
  { key: "entered", title: "Введено", render: (row) => show(row.entered) },
  { key: "expected", title: "Эталон", render: (row) => show(row.expected) },
  {
    key: "ok",
    title: "Совпадение",
    align: "center",
    width: "110px",
    render: (row) => (
      <span data-ok={row.ok} aria-label={row.ok ? "совпадает" : "не совпадает"}>
        {row.ok ? "✓" : "✗"}
      </span>
    ),
  },
];

/**
 * Разбор попытки режима 112: итоговый балл и составляющие, «сдал/не сдал» (только экзамен), ошибки одной строкой,
 * сличение введённого с эталоном по полям, версия оценщика. ИИ-составляющие и комментарий помечены бейджем «ИИ»;
 * приоритет итоговой оценки — за преподавателем (Q&A в3).
 */
export function Operator112Evaluation({ evaluation, format, passThreshold }: Operator112EvaluationProps) {
  const showPassed = format === "exam" && typeof evaluation.passed === "boolean";
  return (
    <section className={styles.eval} aria-label="Разбор попытки">
      <header className={styles.eval__head}>
        <div className={styles.eval__total} data-testid="total-score">
          <span className={styles.eval__value}>{evaluation.totalScore}</span>
          <span className={styles.eval__caption}>итоговый балл</span>
        </div>
        {showPassed ? (
          <p className={styles.eval__verdict} data-passed={evaluation.passed} role="status">
            {evaluation.passed ? "Сдан" : "Не сдан"}
            {typeof passThreshold === "number" ? ` (порог ${passThreshold})` : ""}
          </p>
        ) : null}
        <p className={styles.eval__note}>Оценка предварительная: итог за преподавателем.</p>
      </header>

      <ul className={styles.eval__components} aria-label="Составляющие оценки">
        {COMPONENTS.map(({ key, title }) => (
          <li key={key} className={styles.eval__component}>
            <span>{title}</span>
            <strong>{evaluation[key]}</strong>
          </li>
        ))}
      </ul>

      <div>
        <h3 className={styles.eval__title}>Ошибки</h3>
        {evaluation.errors.length === 0 && evaluation.grammarErrors.length === 0 ? (
          <p className={styles.eval__note}>Ошибок не найдено</p>
        ) : (
          <ul className={styles.eval__errors}>
            {evaluation.errors.map((error, index) => (
              <li key={`error-${index}`}>{errorLine(error)}</li>
            ))}
            {evaluation.grammarErrors.map((error, index) => (
              <li key={`grammar-${index}`}>
                Грамматика: «{show(error.wrong)}» → «{show(error.expected)}»
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className={styles.eval__title}>Сличение с эталоном</h3>
        <Table
          columns={DIFF_COLUMNS}
          rows={evaluation.fieldDiff}
          getRowKey={(row) => row.field}
          caption="Сличение введённых полей с эталоном билета"
          emptyText="Различий не зафиксировано"
        />
      </div>

      <p className={styles.eval__comment}>
        <AiBadge /> {evaluation.aiComment || "Комментарий ИИ отсутствует"}
      </p>
      <p className={styles.eval__note}>Оценщик: {evaluation.assessorVersion || "не указан"}</p>
    </section>
  );
}
