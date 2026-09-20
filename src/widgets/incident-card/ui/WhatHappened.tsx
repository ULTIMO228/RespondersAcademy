"use client";

import { useState } from "react";

import {
  buildQuestionGroups,
  getQuestionnaireTitle,
  QuestionnaireChips,
} from "@/features/incident-type-picker";
import type { ClassifierEntry } from "@/shared/api";

import { VIS_EMPTY_KLASS } from "../config/constants";
import type { IncidentCardData } from "../model/types";

import styles from "./WhatHappened.module.css";

type WhatHappenedProps = {
  what: IncidentCardData["what"];
  classifierEntries: ClassifierEntry[];
  isFromVis?: boolean;
};

const VIS_EMPTY_QUESTIONNAIRE = "Опросная карта не заполнена (карточка из ВИС)";

function formatSigns(signs: string[]): string {
  return signs.length ? `${signs.join(". ")}.` : "";
}

/**
 * «Что случилось»: тёмный заголовок типа, строка атрибутов анкеты (свёрнутая опросная карта),
 * «Класс.:», «[ВИС] Класс.:» (только у ВИС-карточек). Клик по заголовку разворачивает опросную карту (read-only).
 */
export function WhatHappened({ what, classifierEntries, isFromVis = false }: WhatHappenedProps) {
  const [isExpanded, setExpanded] = useState(false);
  const classifierCode = what.classifierCode ?? "";
  const cardEntry = classifierEntries.find((entry) => entry.code === classifierCode);
  const title = getQuestionnaireTitle(cardEntry?.mainService);
  const groups = buildQuestionGroups(classifierEntries, classifierCode, what.signs);
  const signsLine = formatSigns(what.signs);
  const hasVisKlass = isFromVis || Boolean(what.visKlass);

  return (
    <section className={styles.what} aria-label="Что случилось">
      <div className={styles.what__questionnaire}>
        <button
          type="button"
          className={styles.what__header}
          aria-expanded={isExpanded}
          title={isExpanded ? "Свернуть опросную карту (Alt + T)" : "Развернуть опросную карту (Alt + T)"}
          onClick={() => setExpanded((expanded) => !expanded)}
        >
          <span className={styles.what__title}>{title}</span>
        </button>
        {isExpanded ? (
          <QuestionnaireChips groups={groups} emptyText={isFromVis ? VIS_EMPTY_QUESTIONNAIRE : undefined} />
        ) : (
          <div className={styles.what__signs}>
            {signsLine ? <strong>{signsLine}</strong> : null}
            {what.pollAnswers ? <strong>{what.pollAnswers}</strong> : null}
            {!signsLine && !what.pollAnswers ? (
              <span className={styles.what__empty}>
                {isFromVis ? "Нет формализованных признаков (карточка из ВИС)" : "Признаки не заполнены"}
              </span>
            ) : null}
          </div>
        )}
      </div>
      <p className={styles.what__line}>
        Класс.:{" "}
        {what.klass ? (
          <strong>{what.klass}</strong>
        ) : (
          <span className={styles.what__empty}>{isFromVis ? VIS_EMPTY_KLASS : "не определён"}</span>
        )}
      </p>
      {hasVisKlass ? (
        <p className={styles.what__line}>
          [ВИС] Класс.:{" "}
          {what.visKlass ? (
            <strong>{what.visKlass}</strong>
          ) : (
            <span className={styles.what__empty}>{VIS_EMPTY_KLASS}</span>
          )}
        </p>
      ) : null}
    </section>
  );
}
