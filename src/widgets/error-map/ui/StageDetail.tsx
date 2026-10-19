import Link from "next/link";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { ERROR_MAP_LEVEL_META } from "@/entities/error-map";
import type { ErrorMapSeverity, ErrorMapStage, ErrorMapStageDetail } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import { AiExplain } from "./AiExplain";
import type { AiExplainTarget } from "./AiExplain";
import { ChainHint } from "./ChainHint";
import styles from "./ErrorMap.module.css";

export interface StageDetailProps {
  /** Готовые данные разбора; loading/empty/error ведёт страница. */
  detail: ErrorMapStageDetail;
  /** Этапы схемы — для названий в цепочке причин. */
  stages: ErrorMapStage[];
  onClose: () => void;
  /** Переход к связанному этапу из цепочки (необязательно). */
  onSelectStage?: (stageId: string) => void;
  /** Слот кнопки «Назначить тренировку по этому этапу» (формирует feature error-map-assign). */
  assignAction?: ReactNode;
  /** Адрес карты обучающегося: с ним имена в типовых ошибках становятся ссылками; без него — обычный текст. */
  studentHref?: (studentId: string) => string;
  /** Контекст для ответа «Согласен / Не согласен»; без него блок «Почему так происходит» не показывается. */
  explainTarget?: AiExplainTarget;
}

const MAX_ERRORS = 3;

const SEVERITY_LABELS: Readonly<Record<ErrorMapSeverity, string>> = {
  critical: "критичная",
  major: "существенная",
  minor: "незначительная",
};

/**
 * Разбор этапа под лентой (FR-008…FR-010): типовые ошибки простыми словами (до 3) с именами обучающихся,
 * ссылки на пример и статью справочника, цепочка причин, закрытие кнопкой.
 */
export function StageDetail({
  detail,
  stages,
  onClose,
  onSelectStage,
  assignAction,
  studentHref,
  explainTarget,
}: StageDetailProps) {
  const { stage, level, typicalErrors, chain, explanation } = detail;
  const meta = ERROR_MAP_LEVEL_META[level.level];
  const errors = typicalErrors.slice(0, MAX_ERRORS);
  return (
    <section className={styles.detail} aria-labelledby={`stage-detail-${stage.id}`}>
      <header className={styles.detail__header}>
        <h2 id={`stage-detail-${stage.id}`} className={styles.detail__title}>
          {stage.title}
          <span className={styles.detail__level}>
            {" "}
            <span aria-hidden="true">{meta.icon}</span> {meta.label}
          </span>
        </h2>
        <button type="button" className={styles.detail__close} onClick={onClose}>
          Закрыть разбор
        </button>
      </header>

      {errors.length === 0 ? (
        <p className={styles.detail__empty}>По этому этапу типовых ошибок за период нет</p>
      ) : (
        <div>
          <h3 className={styles.detail__subtitle}>Типовые ошибки</h3>
          <ul className={styles.detail__errors} aria-label="Типовые ошибки">
            {errors.map((error) => (
              <li key={error.ruleId} className={styles.detail__error}>
                <p className={styles.detail__errorText}>
                  {error.plainText}{" "}
                  <span className={styles.detail__severity}>({SEVERITY_LABELS[error.severity]})</span>
                </p>
                <p className={styles.detail__students}>
                  Обучающиеся:{" "}
                  {error.students.map((student, index) => (
                    <Fragment key={student.id}>
                      {index > 0 ? ", " : null}
                      {studentHref ? (
                        <Link className={styles.detail__studentLink} href={studentHref(student.id)}>
                          {student.name}
                        </Link>
                      ) : (
                        student.name
                      )}
                    </Fragment>
                  ))}
                </p>
                {error.exampleSessionId ? (
                  <Link className={styles.detail__link} href={ROUTES.teacherReport(error.exampleSessionId)}>
                    Открыть пример
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explanation && explainTarget ? <AiExplain explanation={explanation} target={explainTarget} /> : null}

      <ChainHint chain={chain} stages={stages} onSelectStage={onSelectStage} />

      <div className={styles.detail__actions}>
        {stage.articleId ? (
          <Link className={styles.detail__link} href={ROUTES.referenceArticle(stage.articleId)}>
            Статья справочника
          </Link>
        ) : null}
        {assignAction}
      </div>
    </section>
  );
}
