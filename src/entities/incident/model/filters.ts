/*
 * Фильтры расширенного поиска карточек (T1.2-03) — spec/000-фронт/04-pages/01-arm-main.md → «Расширенный поиск».
 * Чистая функция: AND между полями, OR внутри множественного поля, пустое поле не применяется.
 *
 * Нормализация строк (normalizeSearchText): trim, схлопывание пробелов, нижний регистр ru-RU, «ё» → «е» —
 * поиск регистронезависим, в том числе для кириллицы. Для АОН сравниваются только цифры.
 * Признаки ищутся только по 1–2-му уровню дерева (what.signs[0..1]): поиск по 3-му уровню в ПОВ-112
 * не работает (памятка стр. 35–40) — ограничение сохранено честно.
 * Канала связи в модели ArmCardFixture нет (spec/000-фронт/05-data-models.md §5): его даёт resolveChannel вызывающего
 * кода; без него фильтр по каналу не находит ни одной карточки (канал неизвестен), а не игнорируется.
 */
import type { ArmCardFixtureContract, CardSearchFilters } from "@/shared/api";

type Card = ArmCardFixtureContract;

export type FilterCardsOptions = {
  /** Канал связи карточки (reference.channels); в фикстуре поля нет. */
  resolveChannel?: (card: Card) => string | null | undefined;
};

/** Глубина дерева признаков, по которой работает поиск ПОВ-112 (3-й уровень — не ищется). */
export const SEARCHABLE_SIGN_LEVELS = 2;

const ARM_PATTERN = /АРМ\s*(\d+)/i;
const COUNTRY_COMPONENT = "россия";
const DISTRICT_COMPONENT_START = "(";
const NON_DIGITS = /\D/g;

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function includesText(haystack: string | undefined, needle: string): boolean {
  return normalizeSearchText(haystack ?? "").includes(normalizeSearchText(needle));
}

function equalsText(left: string | null | undefined, right: string): boolean {
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function hasAnyEqual(value: string | null | undefined, variants: readonly string[]): boolean {
  return variants.some((variant) => equalsText(value, variant));
}

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === "";
}

function activeList<T extends string>(values: readonly T[] | undefined): T[] {
  return (values ?? []).filter((value) => value.trim() !== "");
}

export function getCardArmNumber(card: Card): string | null {
  return ARM_PATTERN.exec(card.registeredBy)?.[1] ?? null;
}

/**
 * Регион — компонент формализованного адреса перед «(округ, район)» без страны:
 * «Россия, Москва, (ЮАО, …), …» и «Москва, (ЮАО, …), …» → «Москва».
 */
export function getCardRegion(card: Card): string {
  const components = card.address.formal.split(",").map((part) => part.trim());
  const districtIndex = components.findIndex((part) => part.startsWith(DISTRICT_COMPONENT_START));
  const beforeDistrict = components.slice(0, districtIndex < 0 ? 1 : districtIndex);
  const regions = beforeDistrict.filter((part) => normalizeSearchText(part) !== COUNTRY_COMPONENT);
  return regions[regions.length - 1] ?? "";
}

function matchesApplicant(card: Card, query: string): boolean {
  const digits = query.replace(NON_DIGITS, "");
  const byPhone = digits.length > 0 && card.phones.aon.replace(NON_DIGITS, "").includes(digits);
  return byPhone || includesText(card.applicant.name, query);
}

function matchesOperator(card: Card, query: string): boolean {
  return [card.registeredBy, ...card.workLines.map((line) => line.operator)].some((text) =>
    includesText(text, query),
  );
}

function matchesPeriod(card: Card, from: string | undefined, to: string | undefined): boolean {
  const createdMs = Date.parse(card.createdAt);
  if (!isBlank(from) && createdMs < Date.parse(from)) return false;
  return isBlank(to) || createdMs <= Date.parse(to);
}

type Predicate = (card: Card) => boolean;
type TextField = "incidentType" | "address" | "raion" | "descriptiveAddress" | "region" | "description";
type TextRuleField = TextField | "applicant" | "operator" | "cardNumber";

/** Правила скалярных полей: подстрока, кроме района/региона (точное совпадение одного значения). */
const TEXT_RULES: Record<TextRuleField, (card: Card, value: string) => boolean> = {
  incidentType: (card, value) =>
    includesText(card.what.finalType, value) || includesText(card.what.klass, value),
  address: (card, value) => includesText(card.address.formal, value),
  raion: (card, value) => equalsText(card.address.raion, value),
  descriptiveAddress: (card, value) => includesText(card.address.descriptive, value),
  region: (card, value) => equalsText(getCardRegion(card), value),
  description: (card, value) => includesText(card.description, value),
  applicant: matchesApplicant,
  operator: matchesOperator,
  cardNumber: (card, value) => String(card.number).includes(value.trim()),
};

function buildTextPredicates(filters: CardSearchFilters): Predicate[] {
  return (Object.keys(TEXT_RULES) as TextRuleField[]).flatMap((field) => {
    const value = filters[field];
    return isBlank(value) ? [] : [(card: Card) => TEXT_RULES[field](card, value)];
  });
}

function buildListPredicates(filters: CardSearchFilters, options: FilterCardsOptions): Predicate[] {
  const predicates: Predicate[] = [];
  const add = (values: readonly string[] | undefined, rule: (card: Card, active: string[]) => boolean) => {
    const active = activeList(values);
    if (active.length > 0) predicates.push((card) => rule(card, active));
  };
  add(filters.signs, (card, signs) =>
    card.what.signs.slice(0, SEARCHABLE_SIGN_LEVELS).some((sign) => hasAnyEqual(sign, signs)),
  );
  add(filters.arms, (card, arms) => arms.map((arm) => arm.trim()).includes(getCardArmNumber(card) ?? ""));
  add(filters.okrugs, (card, okrugs) => hasAnyEqual(card.address.okrug, okrugs));
  add(filters.services, (card, ids) => card.notificationList.some((entry) => ids.includes(entry.serviceId)));
  add(filters.channels, (card, channels) => hasAnyEqual(options.resolveChannel?.(card), channels));
  add(filters.sources, (card, sources) => hasAnyEqual(card.source, sources));
  add(filters.cardStatuses, (card, statuses) => statuses.includes(card.cardStatus));
  return predicates;
}

/** Карточки, прошедшие все заданные фильтры; порядок исходного списка сохраняется, вход не мутируется. */
export function filterCards(
  cards: readonly Card[],
  filters: CardSearchFilters,
  options: FilterCardsOptions = {},
): Card[] {
  const predicates = [...buildTextPredicates(filters), ...buildListPredicates(filters, options)];
  if (!isBlank(filters.createdFrom) || !isBlank(filters.createdTo)) {
    predicates.push((card) => matchesPeriod(card, filters.createdFrom, filters.createdTo));
  }
  return cards.filter((card) => predicates.every((predicate) => predicate(card)));
}
