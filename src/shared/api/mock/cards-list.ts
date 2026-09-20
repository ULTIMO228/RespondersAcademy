/*
 * GET /api/mock/cards — список главного экрана АРМ (T1.1-10, T1.2-04).
 *
 * Источник — fixtures/arm-cards.json (порядок файла) + 96 учебных карточек
 * cards.json в списочной проекции поверх фикстуры группы (fixture-map.ts); `dataset` сужает источник.
 * Расширенный поиск — поля CardSearchFilters (entities/incident → filterCards, передаётся параметром).
 * Базовые фильтры T1.1-10 сохранены:
 *   status — синоним cardStatus (reference.cardStatuses), множественный — повторными ключами;
 *   type   — тип происшествия (what.finalType), регистронезависимое точное совпадение;
 *   q      — подстрока (регистронезависимо, кириллица) по номеру, адресу (формальному и описательному) и типу.
 * Вид ленты (T2.2-03, селектор «выберите что показать»): view = all (по умолчанию) | empty | sms —
 *   empty — «Пустые карточки»: завершённые без обработки (статус completed/unfinished, нет отработок и
 *           оповещённых служб; признака «Нет контакта»/«Срыв звонка» в моках нет — это его ближайшая проекция);
 *   sms   — «Новые СМС»: есть входящие СМС (smsList фикстуры или входящие из store).
 * Сортировка (T2.2-04, колонка «Дата ↓» ленты): sort = -createdAt (новые сверху) | createdAt; без параметра —
 *   порядок источника (файл фикстур, затем c-001…c-096). Сортировка устойчивая, до пагинации.
 * Пагинация — единый формат проекта PageResponse `{ items, total, page, perPage }` (perPage по умолчанию 10),
 * применяется ПОСЛЕ фильтров (total — после фильтров); page за пределами — пустой items при корректном total.
 */
import type { ArmCardFixture, CardSearchFilters, CardStatus, PageResponse } from "../types";
import { projectTrainingCard } from "./fixture-map";
import { readArmFixtures, readCards, readReference } from "./readers";
import { readListParam, readPageParams, readStringParam } from "./request";
import { badRequest } from "./respond";
import { readCardRuntime } from "./store-cards";

/** Опции поиска: канал связи карточки (в модели фикстуры поля нет — даёт мок-слой). */
export type CardSearchOptions = {
  resolveChannel?: (card: ArmCardFixture) => string | null | undefined;
};

/**
 * Функция расширенного поиска (entities/incident → filterCards). shared не импортирует entities —
 * её передаёт серверная сборка handler'ов (src/app/mock-api).
 */
export type CardSearch = (
  cards: readonly ArmCardFixture[],
  filters: CardSearchFilters,
  options: CardSearchOptions,
) => ArmCardFixture[];

/** Какие карточки в выдаче: all — фикстуры + 96 учебных (по умолчанию), fixtures, training. */
const CARD_DATASETS = ["all", "fixtures", "training"] as const;
type CardDataset = (typeof CARD_DATASETS)[number];

/** Вид ленты «выберите что показать»: all — все карточки, empty — пустые, sms — с новыми СМС. */
const CARD_VIEWS = ["all", "empty", "sms"] as const;
type CardView = (typeof CARD_VIEWS)[number];
/** Статусы завершённой карточки — кандидаты в «пустые» (если обработки не было). */
const FINISHED_CARD_STATUSES: readonly CardStatus[] = ["completed", "unfinished"];
/** Сортировка по дате заведения: «-» — по убыванию. */
const CARD_SORTS = ["createdAt", "-createdAt"] as const;
type CardSort = (typeof CARD_SORTS)[number];

/** Скалярные поля CardSearchFilters: query-ключ = имя поля. */
const SCALAR_FILTER_KEYS = [
  "incidentType",
  "address",
  "raion",
  "descriptiveAddress",
  "region",
  "description",
  "applicant",
  "operator",
  "cardNumber",
] as const;

/**
 * Множественные поля: канонический ключ — единственное число с повтором (`?okrug=ЮАО&okrug=ЦАО`);
 * имя поля CardSearchFilters (`okrugs`) принимается как синоним. CSV не разбирается (запятая — часть значения).
 */
const LIST_FILTER_KEYS = {
  signs: "sign",
  arms: "arm",
  okrugs: "okrug",
  services: "service",
  channels: "channel",
  sources: "source",
} as const;

/** Канал связи фикстур: все карточки набора заведены по вызову с определённым номером (АОН). */
const AON_CHANNEL = "телефония (АОН)";

export function resolveCardChannel(card: ArmCardFixture): string | null {
  return card.phones.aon.trim() ? AON_CHANNEL : null;
}

function readMultiParam(params: URLSearchParams, key: string, alias: string): string[] {
  return [...readListParam(params, key), ...readListParam(params, alias)];
}

/** status (T1.1-10) и cardStatus/cardStatuses (T1.2-04) — синонимы; неизвестное значение → 400. */
function readCardStatuses(params: URLSearchParams): CardStatus[] {
  const known = new Set<string>(readReference().cardStatuses.map((definition) => definition.status));
  const statuses = ["status", "cardStatus", "cardStatuses"].flatMap((key) => readListParam(params, key));
  const unknown = statuses.find((status) => !known.has(status));
  if (unknown) throw badRequest(`Неизвестный статус карточки: ${unknown}`);
  return statuses as CardStatus[];
}

function readPeriodParam(params: URLSearchParams, key: "createdFrom" | "createdTo"): string | undefined {
  const raw = readStringParam(params, key);
  if (raw !== undefined && Number.isNaN(Date.parse(raw))) {
    throw badRequest(`Некорректная дата параметра «${key}»: ${raw}`);
  }
  return raw;
}

/** Query → CardSearchFilters (пустые параметры не попадают в фильтр и не применяются). */
export function readCardSearchFilters(params: URLSearchParams): CardSearchFilters {
  const filters: CardSearchFilters = {};
  for (const key of SCALAR_FILTER_KEYS) {
    const value = readStringParam(params, key);
    if (value !== undefined) filters[key] = value;
  }
  for (const [field, key] of Object.entries(LIST_FILTER_KEYS) as [keyof typeof LIST_FILTER_KEYS, string][]) {
    const values = readMultiParam(params, key, field);
    if (values.length > 0) filters[field] = values;
  }
  const cardStatuses = readCardStatuses(params);
  if (cardStatuses.length > 0) filters.cardStatuses = cardStatuses;
  const createdFrom = readPeriodParam(params, "createdFrom");
  const createdTo = readPeriodParam(params, "createdTo");
  if (createdFrom) filters.createdFrom = createdFrom;
  if (createdTo) filters.createdTo = createdTo;
  return filters;
}

function readDataset(params: URLSearchParams): CardDataset {
  const raw = readStringParam(params, "dataset") ?? "all";
  if (!(CARD_DATASETS as readonly string[]).includes(raw)) {
    throw badRequest(`Некорректное значение параметра «dataset»: ${raw}`);
  }
  return raw as CardDataset;
}

function readView(params: URLSearchParams): CardView {
  const raw = readStringParam(params, "view") ?? "all";
  if (!(CARD_VIEWS as readonly string[]).includes(raw)) {
    throw badRequest(`Некорректное значение параметра «view»: ${raw}`);
  }
  return raw as CardView;
}

function readSort(params: URLSearchParams): CardSort | undefined {
  const raw = readStringParam(params, "sort");
  if (raw !== undefined && !(CARD_SORTS as readonly string[]).includes(raw)) {
    throw badRequest(`Некорректное значение параметра «sort»: ${raw}`);
  }
  return raw as CardSort | undefined;
}

function sortCards(cards: ArmCardFixture[], sort: CardSort | undefined): ArmCardFixture[] {
  if (!sort) return cards;
  const direction = sort.startsWith("-") ? -1 : 1;
  return [...cards].sort(
    (left, right) => direction * (Date.parse(left.createdAt) - Date.parse(right.createdAt)),
  );
}

function hasIncomingSms(card: ArmCardFixture): boolean {
  if ((card.smsList ?? []).length > 0) return true;
  return readCardRuntime(card.id).sms.some((sms) => sms.direction === "incoming");
}

function isEmptyCard(card: ArmCardFixture): boolean {
  return (
    FINISHED_CARD_STATUSES.includes(card.cardStatus) &&
    card.workLines.length === 0 &&
    card.notificationList.length === 0
  );
}

const VIEW_PREDICATES: Record<CardView, (card: ArmCardFixture) => boolean> = {
  all: () => true,
  empty: isEmptyCard,
  sms: hasIncomingSms,
};

/** Источник списка: фикстуры (порядок файла), затем учебные c-001…c-096 в списочной проекции. */
function readListSource(dataset: CardDataset): ArmCardFixture[] {
  const fixtures = dataset === "training" ? [] : [...readArmFixtures()];
  const training = dataset === "fixtures" ? [] : readCards().map(projectTrainingCard);
  return [...fixtures, ...training];
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

/** Базовые фильтры T1.1-10 (обратная совместимость): type — точное совпадение типа, q — подстрока. */
function matchesBaseFilters(card: ArmCardFixture, type: string | undefined, q: string | undefined): boolean {
  if (type && normalize(card.what.finalType) !== type) return false;
  if (!q) return true;
  const haystack = [String(card.number), card.address.formal, card.address.descriptive, card.what.finalType];
  return haystack.some((field) => normalize(field).includes(q));
}

/** Страница списка по query-параметрам; мусор в page/perPage/status/периоде/dataset/view/sort → 400. */
export function listCards(params: URLSearchParams, search: CardSearch): PageResponse<ArmCardFixture> {
  const { page, perPage } = readPageParams(params);
  const filters = readCardSearchFilters(params);
  const type = readStringParam(params, "type");
  const q = readStringParam(params, "q");
  const source = readListSource(readDataset(params));
  const matchesView = VIEW_PREDICATES[readView(params)];
  const sort = readSort(params);
  const found = search(source, filters, { resolveChannel: resolveCardChannel }).filter(
    (card) => matchesView(card) && matchesBaseFilters(card, type && normalize(type), q && normalize(q)),
  );
  const matched = sortCards(found, sort);
  const start = (page - 1) * perPage;
  return {
    items: structuredClone(matched.slice(start, start + perPage)),
    total: matched.length,
    page,
    perPage,
  };
}
