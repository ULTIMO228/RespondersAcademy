import type { KbArticle, KbSections } from "@/shared/api";

/** Минимальная длина слова запроса: короче — поиск не запускается (спека 016, «Введите хотя бы 3 буквы»). */
export const KB_QUERY_MIN_LENGTH = 3;
const MIN_STEM = 3;
const WEIGHT = { title: 3, group: 2, thesis: 1 } as const;

/** Порядок разделов статьи в панели (FR-004). */
export const KB_SECTION_ORDER: { key: keyof KbSections; title: string }[] = [
  { key: "signs", title: "Признаки" },
  { key: "notification", title: "Оповещение служб" },
  { key: "clarify", title: "Что уточнить у заявителя" },
  { key: "ddsDecision", title: "Решение ДДС" },
  { key: "typicalErrors", title: "Типичные ошибки" },
];

// Типовые окончания русских слов, от длинных к коротким («snowball-lite»: без словаря и внешних пакетов).
const ENDINGS = [
  "иями",
  "ями",
  "ами",
  "ией",
  "иях",
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ая",
  "яя",
  "ое",
  "ее",
  "ие",
  "ые",
  "ой",
  "ей",
  "ий",
  "ый",
  "ую",
  "юю",
  "ам",
  "ям",
  "ах",
  "ях",
  "ом",
  "ем",
  "ов",
  "ев",
  "ию",
  "ия",
  "ие",
  "ии",
  "а",
  "я",
  "о",
  "е",
  "ы",
  "и",
  "у",
  "ю",
  "ь",
  "й",
];

/** Нижний регистр, «ё» → «е», только буквы и цифры. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

/** Основа слова: отсекается одно типовое окончание, основа не короче 3 букв. */
export function stem(word: string): string {
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= MIN_STEM)
      return word.slice(0, -ending.length);
  }
  return word;
}

/** Основы слов запроса; слова короче 3 букв отбрасываются. */
export function queryStems(query: string): string[] {
  const words = normalize(query)
    .split(" ")
    .filter((word) => word.length >= KB_QUERY_MIN_LENGTH);
  return [...new Set(words.map(stem))];
}

function words(text: string): string[] {
  const clean = normalize(text);
  return clean ? clean.split(" ") : [];
}

function hits(text: string, stemValue: string): number {
  return words(text).filter((word) => word.startsWith(stemValue)).length;
}

export type KbSearchHit = { article: KbArticle; score: number; stems: string[] };

/**
 * Поиск статей: в выдачу попадают статьи, где найдены все основы запроса (название, группа или тезисы).
 * Вес совпадения: название 3, группа 2, тезис 1. Сортировка — по весу, затем по названию.
 */
export function searchArticles(articles: KbArticle[], query: string): KbSearchHit[] {
  const stems = queryStems(query);
  if (stems.length === 0) return [];
  const result: KbSearchHit[] = [];
  for (const article of articles) {
    const theses = KB_SECTION_ORDER.flatMap(({ key }) => article.sections[key] ?? []);
    let score = 0;
    let all = true;
    for (const stemValue of stems) {
      const found =
        hits(article.title, stemValue) * WEIGHT.title +
        hits(article.group, stemValue) * WEIGHT.group +
        theses.reduce((sum, thesis) => sum + hits(thesis, stemValue), 0) * WEIGHT.thesis;
      if (found === 0) {
        all = false;
        break;
      }
      score += found;
    }
    if (all) result.push({ article, score, stems });
  }
  return result.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "ru"));
}

export type HighlightPart = { text: string; match: boolean };

/** Разбивка текста на куски для подсветки: совпадением считается слово, начинающееся с одной из основ. */
export function highlightParts(text: string, stems: string[]): HighlightPart[] {
  if (stems.length === 0) return [{ text, match: false }];
  const parts: HighlightPart[] = [];
  for (const piece of text.split(/([A-Za-zА-Яа-яЁё0-9]+)/)) {
    if (!piece) continue;
    const word = normalize(piece);
    const match = word !== "" && stems.some((stemValue) => word.startsWith(stemValue));
    const last = parts[parts.length - 1];
    if (last && last.match === match && !match) last.text += piece;
    else parts.push({ text: piece, match });
  }
  return parts;
}
