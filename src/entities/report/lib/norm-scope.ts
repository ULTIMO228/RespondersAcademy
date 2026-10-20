/*
 * Подписи нормативов по специализации (спека 019, FR-011): у 112 это ответ на вызов и отправка карточки,
 * у ДДС — реакция на карточку и полная отработка. Числа по умолчанию совпадают (30 с / 3 мин), но измеряют разное,
 * поэтому подпись всегда называет, что именно сравнивается. У 112 нормативы задания могут быть иными (AssignmentParams.norms).
 */
import { PROCESSING_NORM_LABEL, REACTION_NORM_LABEL } from "./analytics";

export type NormScope = "operator112" | "dds";

export const NORM_SCOPE_LABELS: Record<NormScope, string> = { operator112: "Режим 112", dds: "Режим ДДС" };

export type NormDescription = {
  reaction: string;
  processing: string;
  summary: string;
};

const DESCRIPTIONS: Record<NormScope | "all", NormDescription> = {
  operator112: {
    reaction: `ответ на вызов, ${REACTION_NORM_LABEL}`,
    processing: `отправка карточки, ${PROCESSING_NORM_LABEL}`,
    summary:
      "Режим 112: ответ на вызов и отправка карточки; значения 30 с и 3 мин — по умолчанию, задание может задать свои.",
  },
  dds: {
    reaction: `реакция на карточку, ${REACTION_NORM_LABEL}`,
    processing: `полная отработка, ${PROCESSING_NORM_LABEL}`,
    summary: "Режим ДДС: реакция на новую карточку и полная отработка.",
  },
  all: {
    reaction: "ответ на вызов (112) и реакция на карточку (ДДС)",
    processing: "отправка карточки (112) и полная отработка (ДДС)",
    summary:
      "Сводка объединяет 112 (ответ на вызов, отправка карточки) и ДДС (реакция на карточку, полная отработка): эти нормативы измеряют разное, для раздельных цифр выберите режим.",
  },
};

/** Подписи нормативов среза; `all` — смешанный срез без подмены одного норматива другим. */
export function describeNorms(scope: NormScope | "all"): NormDescription {
  return DESCRIPTIONS[scope];
}
