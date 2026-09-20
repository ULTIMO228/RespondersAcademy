import type { TextSegment } from "../model/types";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Разбивает текст на сегменты с подсветкой ключевых фраз эталона (без учёта регистра). */
export function highlightPhrases(text: string, phrases: string[]): TextSegment[] {
  const activePhrases = phrases.filter((phrase) => phrase.trim().length > 0);
  if (activePhrases.length === 0) return [{ text, isMatch: false }];
  const pattern = new RegExp(`(${activePhrases.map(escapeRegExp).join("|")})`, "gi");
  const lowerPhrases = activePhrases.map((phrase) => phrase.toLowerCase());
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, isMatch: lowerPhrases.includes(part.toLowerCase()) }));
}
