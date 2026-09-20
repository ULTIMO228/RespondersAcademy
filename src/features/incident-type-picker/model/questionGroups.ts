import type { ClassifierEntry } from "@/shared/api";

export type QuestionGroup = {
  /** Подпись вопроса — заголовок колонки классификатора (xlsx «112-Признак.1/2/3», доп. признаки). */
  question: string;
  options: string[];
  selected: string[];
};

type SignField = "sign1" | "sign2" | "sign3" | "extraSigns";

const QUESTION_FIELDS: { field: SignField; question: string }[] = [
  { field: "sign1", question: "112-Признак.1" },
  { field: "sign2", question: "112-Признак.2" },
  { field: "sign3", question: "112-Признак.3" },
  { field: "extraSigns", question: "Доп. признаки" },
];

function collectOptions(entries: ClassifierEntry[], field: SignField): string[] {
  const values = entries.map((entry) => entry[field].trim()).filter(Boolean);
  return Array.from(new Set(values));
}

/**
 * Чип-группы опросной карты типа: варианты — все значения признака в записях группы классификатора,
 * выбранные — значения записи карточки (classifierCode) и признаки карточки (what.signs).
 */
export function buildQuestionGroups(
  entries: ClassifierEntry[],
  classifierCode: string,
  cardSigns: string[],
): QuestionGroup[] {
  const cardEntry = entries.find((entry) => entry.code === classifierCode);
  return QUESTION_FIELDS.map(({ field, question }) => {
    const options = collectOptions(entries, field);
    const selected = options.filter((option) => option === cardEntry?.[field] || cardSigns.includes(option));
    return { question, options, selected };
  }).filter((group) => group.options.length > 0);
}

/* Код главной службы классификатора → заголовок опросной карты (ДДС_image6, p16_Image77, p23_Image108). */
const QUESTIONNAIRE_TITLES: Record<string, string> = {
  MCHS: "Происшествие 101",
  Police: "Происшествие 102",
  AMBULANCE: "Происшествие 103",
  MOSGAZ: "Происшествие 104",
};
export const DEFAULT_QUESTIONNAIRE_TITLE = "Аварии и происшествия в городском хозяйстве";

export function getQuestionnaireTitle(mainService: string | undefined): string {
  const firstCode = mainService?.split(",")[0]?.trim() ?? "";
  return QUESTIONNAIRE_TITLES[firstCode] ?? DEFAULT_QUESTIONNAIRE_TITLE;
}
