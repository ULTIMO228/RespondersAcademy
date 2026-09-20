const FEMALE_PATRONYMIC_ENDINGS = ["вна", "чна", "кызы"];

/** Род по отчеству ФИО («Петрова Анна Дмитриевна» → женский) — для глаголов ленты событий. */
export function isFemaleName(fullName: string): boolean {
  const patronymic = fullName.split(" ")[2] ?? "";
  return FEMALE_PATRONYMIC_ENDINGS.some((ending) => patronymic.endsWith(ending));
}

/** «открыл» → «открыла» для курсанток. */
export function conjugatePast(verb: string, fullName: string): string {
  return isFemaleName(fullName) ? `${verb}а` : verb;
}

/** Фамилия из ФИО. */
export function getLastName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}
