import { AiTag, Alert, Card, DataTable, EmptyState, ProgressBar, Tag } from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";
import type { FieldDiff } from "@/shared/api";

import { formatDiffValue } from "../lib/normalize";
import type { ReviewError, ReviewModel } from "../lib/normalize";
import styles from "./AttemptReview.module.css";

const AXIS_TITLES = [
  ["correctnessScore", "Корректность"],
  ["semanticScore", "Смысловая точность"],
  ["grammarScore", "Грамотность"],
  ["timeScore", "Время"],
] as const;

const SEVERITY_TONES = { critical: "danger", major: "danger", minor: "warning" } as const;
const SEVERITY_TITLES = { critical: "критичная", major: "существенная", minor: "незначительная" } as const;

function axisTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  return score >= 60 ? "warning" : "danger";
}

const DIFF_COLUMNS: DataColumn<FieldDiff>[] = [
  { key: "field", title: "Поле", render: (row) => row.field },
  {
    key: "entered",
    title: "Вы ввели",
    render: (row) =>
      row.ok ? (
        formatDiffValue(row.entered)
      ) : (
        <span className={styles["diff--wrong"]}>{formatDiffValue(row.entered)}</span>
      ),
  },
  {
    key: "expected",
    title: "Эталон",
    render: (row) =>
      row.ok ? (
        formatDiffValue(row.expected)
      ) : (
        <span className={styles["diff--right"]}>{formatDiffValue(row.expected)}</span>
      ),
  },
  {
    key: "ok",
    title: "Совпало",
    render: (row) => (row.ok ? <Tag tone="success">да</Tag> : <Tag tone="danger">нет</Tag>),
  },
];

function ErrorRow({ error }: { error: ReviewError }) {
  const severity = error.severity as keyof typeof SEVERITY_TONES | undefined;
  return (
    <li className={styles.errors__item}>
      <span>{error.message}</span>
      {severity && severity in SEVERITY_TONES ? (
        <Tag tone={SEVERITY_TONES[severity]}>{SEVERITY_TITLES[severity]}</Tag>
      ) : null}
    </li>
  );
}

type AttemptReviewProps = { model: ReviewModel };

/**
 * Разбор попытки (T043): оценка по составляющим, различия с эталоном, ошибки одной строкой, комментарий ИИ с бейджем «ИИ» и
 * пометкой о приоритете преподавателя (Q&A в3); решение преподавателя показывается отдельным блоком.
 */
export function AttemptReview({ model }: AttemptReviewProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.column}>
        <Card title="Из чего сложилась оценка" actions={<AiTag title="Оценку выставил ИИ-модуль" />}>
          <div className={styles.axes}>
            {AXIS_TITLES.map(([key, title]) => (
              <div key={key} className={styles.axis}>
                <span>{title}</span>
                <ProgressBar
                  value={model.axes[key]}
                  label={`${title}: ${model.axes[key]} из 100`}
                  tone={axisTone(model.axes[key]) === "success" ? "default" : axisTone(model.axes[key])}
                />
                <span className={styles.axis__value}>{model.axes[key]} / 100</span>
              </div>
            ))}
          </div>
          <p className={styles.note}>
            Итог — {model.totalScore} из 100
            {model.assessorVersion ? ` · оценщик ${model.assessorVersion}` : ""}. Оценку выставляет ИИ-модуль;
            приоритет итогового решения — за преподавателем.
          </p>
        </Card>

        {model.fieldDiff ? (
          <Card title="Сравнение с эталоном">
            {model.fieldDiff.length === 0 ? (
              <EmptyState title="Различий нет" text="Все поля карточки совпали с эталоном." />
            ) : (
              <DataTable
                caption="Сравнение с эталоном"
                columns={DIFF_COLUMNS}
                rows={model.fieldDiff}
                getRowKey={(row) => row.field}
              />
            )}
          </Card>
        ) : null}
      </div>

      <div className={styles.column}>
        {model.reviewPending ? (
          <Alert tone="warning">Оценка предварительная: ждёт проверки преподавателем.</Alert>
        ) : null}
        <Card title="Ошибки">
          {model.errors.length === 0 ? (
            <EmptyState title="Ошибок нет" text="Замечаний к этой попытке не найдено." />
          ) : (
            <ul className={styles.errors} aria-label="Ошибки попытки">
              {model.errors.map((error, index) => (
                <ErrorRow key={`${error.type}-${index}`} error={error} />
              ))}
            </ul>
          )}
        </Card>
        {model.teacherOverride ? (
          <section className={styles.teacher} aria-label="Решение преподавателя">
            <b>Решение преподавателя · {model.teacherOverride.score} баллов</b>
            <p>{model.teacherOverride.comment}</p>
            <p className={styles.ai__priority}>{model.teacherOverride.by}</p>
          </section>
        ) : null}
        <section className={styles.ai} aria-label="Комментарий ИИ">
          <div className={styles.ai__head}>
            <AiTag title="Комментарий подготовлен ИИ-модулем" /> Комментарий
          </div>
          <p>{model.aiComment || "Комментарий ИИ отсутствует."}</p>
          <p className={styles.ai__priority}>
            {model.teacherOverride
              ? "Решение преподавателя выше оценки ИИ."
              : "Комментарий преподавателя: пока нет — его приоритет выше оценки ИИ."}
          </p>
        </section>
      </div>
    </div>
  );
}
