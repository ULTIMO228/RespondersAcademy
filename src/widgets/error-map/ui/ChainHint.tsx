import type { ErrorMapChainLink, ErrorMapStage } from "@/shared/api";

import styles from "./ErrorMap.module.css";

export interface ChainHintProps {
  /** Связи, исходящие из выбранного этапа. */
  chain: ErrorMapChainLink[];
  /** Этапы схемы — для названий; неизвестный этап показывается по id. */
  stages: ErrorMapStage[];
  /** Если задан, название связанного этапа — кнопка (переход с клавиатуры). */
  onSelectStage?: (stageId: string) => void;
}

function Dash() {
  return (
    <svg className={styles.chain__dash} viewBox="0 0 32 8" width="32" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="31" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

/**
 * Цепочка причин (FR-011): пунктир сопровождается подписью словами «Влияет на: <этап> — <подпись>»,
 * смысл не держится на одной линии.
 */
export function ChainHint({ chain, stages, onSelectStage }: ChainHintProps) {
  if (chain.length === 0) return null;
  const titles = new Map(stages.map((stage) => [stage.id, stage.title]));
  return (
    <ul className={styles.chain} aria-label="Цепочка причин">
      {chain.map((link) => {
        const title = titles.get(link.to) ?? link.to;
        return (
          <li key={`${link.from}->${link.to}`} className={styles.chain__item}>
            <Dash />
            <span className={styles.chain__label}>Влияет на:</span>{" "}
            {onSelectStage ? (
              <button type="button" className={styles.chain__stage} onClick={() => onSelectStage(link.to)}>
                {title}
              </button>
            ) : (
              <span className={styles.chain__stageText}>{title}</span>
            )}
            {" — "}
            <span className={styles.chain__caption}>{link.caption}</span>
          </li>
        );
      })}
    </ul>
  );
}
