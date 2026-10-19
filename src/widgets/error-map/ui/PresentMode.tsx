"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { ERROR_MAP_LEVEL_META } from "@/entities/error-map";
import type { ErrorMapHeadline, ErrorMapStage, ErrorMapStageDetail, ErrorMapStageLevel } from "@/shared/api";

import { countText } from "../model/levelText";
import styles from "./ErrorMap.module.css";
import { StageStrip } from "./StageStrip";

/** Сколько имён показывать на листе показа; остальные сворачиваются в «и ещё N». */
const MAX_NAMES = 8;

export interface PresentModeProps {
  /** Номер текущего шага, с 1. */
  step: number;
  total: number;
  onStep: (next: number) => void;
  onExit: () => void;
  /** Содержимое одного шага: одна тема на экран. */
  children: ReactNode;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * Рамка режима «Показать на экране» (FR-021): одна тема на экран, крупный шрифт (токены `--pf-fs-present*`), явные
 * кнопки «Назад» / «Дальше» и «Выйти из показа». Клавиши: ← и PageUp — назад, → и PageDown — дальше, Esc — выход;
 * сочетания с Ctrl/Alt/Meta и ввод в полях не перехватываются. Кнопки подписаны словами, стрелки в них — украшение.
 */
export function PresentMode({ step, total, onStep, onExit, children }: PresentModeProps) {
  const canBack = step > 1;
  const canNext = step < total;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      if ((event.key === "ArrowRight" || event.key === "PageDown") && canNext) onStep(step + 1);
      else if ((event.key === "ArrowLeft" || event.key === "PageUp") && canBack) onStep(step - 1);
      else if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, canBack, canNext, onStep, onExit]);

  return (
    <section className={styles.present} aria-label="Показ на экране">
      <header className={styles.present__bar}>
        <span className={styles.present__step} aria-live="polite">
          Шаг {step} из {total}
        </span>
        <button type="button" className={styles.present__button} onClick={onExit}>
          Выйти из показа
        </button>
      </header>
      <div className={styles.present__body}>{children}</div>
      <footer className={styles.present__nav}>
        {canBack ? (
          <button type="button" className={styles.present__button} onClick={() => onStep(step - 1)}>
            <span aria-hidden="true">← </span>Назад
          </button>
        ) : (
          <span />
        )}
        {canNext ? (
          <button
            type="button"
            className={`${styles.present__button} ${styles["present__button--primary"]}`}
            onClick={() => onStep(step + 1)}
          >
            Дальше<span aria-hidden="true"> →</span>
          </button>
        ) : null}
      </footer>
      <p className={styles.present__hint}>Стрелки ← → листают, Esc — выход</p>
    </section>
  );
}

export interface PresentHeadlineSlideProps {
  headline: ErrorMapHeadline;
  stages: ErrorMapStage[];
  levels: ErrorMapStageLevel[];
}

/** Шаг 1: фраза-вывод крупно и лента этапов со словом уровня на каждой плитке. */
export function PresentHeadlineSlide({ headline, stages, levels }: PresentHeadlineSlideProps) {
  return (
    <div className={styles.present__slide}>
      <h2 className={styles.present__title}>{headline.text}</h2>
      <StageStrip stages={stages} levels={levels} onSelect={() => undefined} />
    </div>
  );
}

export interface PresentStageSlideProps {
  detail: ErrorMapStageDetail;
}

/** Шаг этапа: название, уровень, типовые ошибки простыми словами и кто ошибается. */
export function PresentStageSlide({ detail }: PresentStageSlideProps) {
  const meta = ERROR_MAP_LEVEL_META[detail.level.level];
  const names = [
    ...new Map(
      detail.typicalErrors.flatMap((error) => error.students).map((item) => [item.id, item.name]),
    ).values(),
  ];
  const shown = names.slice(0, MAX_NAMES);
  const rest = names.length - shown.length;
  return (
    <div className={styles.present__slide}>
      <h2 className={styles.present__title}>{detail.stage.title}</h2>
      <p className={styles.present__level}>
        <span aria-hidden="true">{meta.icon}</span> {meta.label} · {countText(detail.level)}
      </p>
      <h3 className={styles.present__subtitle}>Типичные ошибки</h3>
      {detail.typicalErrors.length === 0 ? (
        <p className={styles.present__text}>Типовых ошибок по этапу не найдено</p>
      ) : (
        <ul className={styles.present__list}>
          {detail.typicalErrors.map((error) => (
            <li key={error.ruleId} className={styles.present__item}>
              <span>{error.plainText}</span>
              <span className={styles.present__count}> · обучающихся: {error.studentCount}</span>
            </li>
          ))}
        </ul>
      )}
      {names.length > 0 ? (
        <>
          <h3 className={styles.present__subtitle}>Кто ошибается</h3>
          <p className={styles.present__text}>
            {shown.join(", ")}
            {rest > 0 ? ` и ещё ${rest}` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
