/*
 * ИИ-модуль: заменить на реальный сервис. Детерминированная мок-проверка грамматики ручного ввода
 * диспетчера (Evaluation.grammarErrors, spec/05-data-models.md §7). Локальный контур: без сети,
 * один и тот же вход → один и тот же результат. Форма ошибки совпадает с контрактом GrammarError.
 */

export type GrammarIssueType = "spelling" | "syntax";

export type GrammarIssue = {
  field: string;
  fragment: string;
  wrong: string;
  expected: string;
  type: GrammarIssueType;
};

/** Словарь типичных опечаток ручного ввода (мок; в т. ч. примеры из mocks/sessions.json). */
export const MOCK_SPELLING_DICTIONARY: Readonly<Record<string, string>> = {
  пренято: "принято",
  напрален: "направлен",
  напрвлен: "направлен",
  сообшение: "сообщение",
  бригадда: "бригада",
  адресс: "адрес",
  полицыя: "полиция",
  пострадавщий: "пострадавший",
  пострадавщих: "пострадавших",
  скорайа: "скорая",
};

/** Поле по умолчанию, если проверяется произвольный текст. */
export const DEFAULT_GRAMMAR_FIELD = "text";

const WORD_PATTERN = /[А-Яа-яЁё]+/g;
const DOUBLE_SPACE_PATTERN = / {2,}/g;
const SPACE_BEFORE_PUNCTUATION_PATTERN = /\s+([,.;:!?])/g;
const LOWERCASE_START_PATTERN = /^[а-яё]/;

function checkSpelling(text: string, field: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  let previousWord = "";
  for (const match of text.matchAll(WORD_PATTERN)) {
    const word = match[0];
    const expected = MOCK_SPELLING_DICTIONARY[word.toLocaleLowerCase("ru-RU")];
    if (expected) {
      const fragment = previousWord ? `${previousWord} ${word}` : word;
      issues.push({ field, fragment, wrong: word, expected, type: "spelling" });
    }
    previousWord = word;
  }
  return issues;
}

function checkSyntax(text: string, field: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const trimmed = text.trim();
  const firstWord = trimmed.match(WORD_PATTERN)?.[0] ?? "";
  if (LOWERCASE_START_PATTERN.test(trimmed) && firstWord) {
    const expected = firstWord[0].toLocaleUpperCase("ru-RU") + firstWord.slice(1);
    issues.push({ field, fragment: firstWord, wrong: firstWord, expected, type: "syntax" });
  }
  for (const match of trimmed.matchAll(DOUBLE_SPACE_PATTERN)) {
    issues.push({ field, fragment: match[0], wrong: match[0], expected: " ", type: "syntax" });
  }
  for (const match of trimmed.matchAll(SPACE_BEFORE_PUNCTUATION_PATTERN)) {
    issues.push({ field, fragment: match[0], wrong: match[0], expected: match[1], type: "syntax" });
  }
  return issues;
}

/** Мок-проверка текста: орфография (словарь) + синтаксис (заглавная буква, лишние пробелы). */
export function checkGrammarText(text: string, field: string = DEFAULT_GRAMMAR_FIELD): GrammarIssue[] {
  if (text.trim() === "") return [];
  return [...checkSpelling(text, field), ...checkSyntax(text, field)];
}

/** Проверка всех полей ручного ввода (CardEvent.enteredText) в порядке ключей. */
export function checkGrammarFields(fields: Readonly<Record<string, string>>): GrammarIssue[] {
  return Object.entries(fields).flatMap(([field, text]) => checkGrammarText(text, field));
}
