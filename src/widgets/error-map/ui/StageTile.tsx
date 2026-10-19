import { ERROR_MAP_COMPARISON_LABELS, ERROR_MAP_LEVEL_META } from "@/entities/error-map";
import type { ErrorMapComparison } from "@/entities/error-map";
import type { ErrorMapStage, ErrorMapStageLevel } from "@/shared/api";

import { countText } from "../model/levelText";
import styles from "./ErrorMap.module.css";

export interface StageTileProps {
  stage: ErrorMapStage;
  level: ErrorMapStageLevel;
  selected?: boolean;
  /** Сравнение обучающегося с группой (только карта обучающегося): подпись словами под плиткой. */
  comparison?: ErrorMapComparison;
  onSelect: (stageId: string) => void;
}

/**
 * Плитка этапа: название, слово уровня, значок и число. Цвет — только усиление: смысл несут слово и значок
 * (SC-006). Кнопка ≥ 44 px, шрифт ≥ 16 px; доступное имя содержит название и уровень.
 */
export function StageTile({ stage, level, selected = false, comparison, onSelect }: StageTileProps) {
  const meta = ERROR_MAP_LEVEL_META[level.level];
  const count = countText(level);
  const comparisonLabel = comparison ? ERROR_MAP_COMPARISON_LABELS[comparison] : null;
  return (
    <button
      type="button"
      className={[styles.tile, styles[`tile--${level.level}`], selected ? styles["tile--selected"] : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${stage.title}: ${meta.label}, ${count}${comparisonLabel ? `, ${comparisonLabel}` : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(stage.id)}
    >
      <span className={styles.tile__title}>{stage.title}</span>
      <span className={styles.tile__level}>
        <span className={styles.tile__icon} aria-hidden="true">
          {meta.icon}
        </span>
        {meta.label}
      </span>
      <span className={styles.tile__count}>{count}</span>
      {comparisonLabel ? <span className={styles.tile__comparison}>{comparisonLabel}</span> : null}
    </button>
  );
}
