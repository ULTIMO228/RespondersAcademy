import { Fragment } from "react";

import type { ErrorMapStage, ErrorMapStageLevel } from "@/shared/api";

import styles from "./ErrorMap.module.css";
import { StageTile } from "./StageTile";

export interface StageStripProps {
  stages: ErrorMapStage[];
  levels: ErrorMapStageLevel[];
  selectedStageId?: string | null;
  onSelect: (stageId: string) => void;
  /** Этапы, связанные цепочкой с выбранным: пунктирная рамка и слово «связан» (не только линия). */
  highlightedStageIds?: string[];
}

function Arrow() {
  return (
    <svg className={styles.strip__arrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Лента этапов схемы по порядку (`order`); этап без записи уровня показывается как «мало данных». */
export function StageStrip({
  stages,
  levels,
  selectedStageId = null,
  onSelect,
  highlightedStageIds = [],
}: StageStripProps) {
  const byStage = new Map(levels.map((item) => [item.stageId, item]));
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  return (
    <ol className={styles.strip} aria-label="Этапы работы">
      {ordered.map((stage, index) => {
        const level: ErrorMapStageLevel = byStage.get(stage.id) ?? {
          stageId: stage.id,
          attempts: 0,
          attemptsWithError: 0,
          share: null,
          level: "noData",
          affectedStudents: 0,
        };
        return (
          <Fragment key={stage.id}>
            <li
              className={[
                styles.strip__item,
                highlightedStageIds.includes(stage.id) ? styles["strip__item--linked"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <StageTile
                stage={stage}
                level={level}
                selected={selectedStageId === stage.id}
                comparison={level.level === "noData" ? undefined : level.comparison}
                onSelect={onSelect}
              />
              {highlightedStageIds.includes(stage.id) ? (
                <span className={styles.strip__linkedNote}>связан с выбранным</span>
              ) : null}
            </li>
            {index < ordered.length - 1 ? (
              <li className={styles.strip__link} aria-hidden="true">
                <Arrow />
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
