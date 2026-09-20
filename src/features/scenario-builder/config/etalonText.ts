/*
 * Эталонная формулировка текста (Etalon.expectedText) в моке сценариев отсутствует — для демо-образца
 * s-032 она «сформирована системой» по ключевым фразам (сценарий А, шаг 3; бейдж «ИИ» в UI).
 */
export const ETALON_TEXT_SAMPLES: Record<string, string> = {
  "s-032":
    "Сообщение принято, бригада направлена на место. Утечка топлива, 3 пострадавших, пожарный расчёт направлен.",
};

export function getEtalonText(scenarioId: string, keyPhrases: string[], expectedText?: string): string {
  if (expectedText) return expectedText;
  const sample = ETALON_TEXT_SAMPLES[scenarioId];
  if (sample) return sample;
  const [first = "", ...rest] = keyPhrases;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(", ") + ".";
}

/** Мок-оценка системы по эталону (показывается рядом с решением преподавателя, но ниже по приоритету). */
export const AI_ETALON_ASSESSMENT = {
  confidence: "0,87",
  summary:
    "Службы и типы ЕКП согласованы с матрицей классификатора v.046_24; порядок звонков соответствует регламенту.",
};
