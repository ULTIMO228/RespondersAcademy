/*
 * Маппинг учебных карточек (IncidentCard, "c-NNN") на UI-фикстуры ПОВ-112 (ArmCardFixture, "card-*").
 * Риск плана «96 учебных карточек ≠ рабочие карточки ПОВ-112» (spec/11-implementation-plan.md §7):
 * экранный рендер карточки берётся из фикстуры, учебные поля (expectedServices/expectedTags) остаются
 * в учебной проекции IncidentCard и в фикстуру не переносятся.
 *
 * ПРАВИЛО (детерминированное, без случайности; кандидаты упорядочены по стабильному ключу — number фикстуры):
 *   1. Прямое совпадение группы: фикстура, чей what.classifierCode в classifier.json относится к группе
 *      card.group (связь fixtures.what.classifierCode → entries[].code → entries[].group).
 *   2. Fallback по главной службе группы: mainService, чаще всего встречающийся у записей классификатора
 *      этой группы (пустые игнорируются, при равенстве — по алфавиту), → первая фикстура с тем же
 *      mainService у её classifierCode.
 *   3. Дефолт: DEFAULT_FIXTURE_ID (или первая фикстура по ключу, если его нет в наборе).
 * Карточки одной группы всегда получают одну и ту же фикстуру. Моки не мутируются.
 */
import type { ArmCardFixture, ClassifierEntry, IncidentCard } from "../types";
import { readArmFixtures, readClassifier } from "./readers";

/** Дефолтная фикстура — «Дерево упало во дворе», первая карточка набора (эталон скриншотов КАРТОЧКА_*). */
export const DEFAULT_FIXTURE_ID = "card-881412";

export type FixtureMatchRule = "group" | "mainService" | "default";

export interface FixtureResolution {
  fixture: ArmCardFixture;
  rule: FixtureMatchRule;
}

export interface FixtureResolverSource {
  fixtures: readonly ArmCardFixture[];
  classifier: readonly ClassifierEntry[];
}

export type FixtureResolver = (group: string) => FixtureResolution;

function byStableKey(left: ArmCardFixture, right: ArmCardFixture): number {
  return left.number - right.number;
}

/** Самый частый непустой mainService записей группы; при равенстве — первый по алфавиту. */
function dominantMainService(entries: readonly ClassifierEntry[]): string | undefined {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.mainService) counts.set(entry.mainService, (counts.get(entry.mainService) ?? 0) + 1);
  }
  const ranked = [...counts].sort(([leftName, left], [rightName, right]) =>
    right === left ? leftName.localeCompare(rightName) : right - left,
  );
  return ranked[0]?.[0];
}

/** Резолвер с мемоизацией по группе; источник данных инъецируется (тесты fallback-цепочки). */
export function createFixtureResolver(source: FixtureResolverSource): FixtureResolver {
  const fixtures = [...source.fixtures].sort(byStableKey);
  const entryByCode = new Map(source.classifier.map((entry) => [entry.code, entry]));
  const entryOf = (fixture: ArmCardFixture) =>
    fixture.what.classifierCode ? entryByCode.get(fixture.what.classifierCode) : undefined;
  const fallback = fixtures.find((fixture) => fixture.id === DEFAULT_FIXTURE_ID) ?? fixtures[0];
  const cache = new Map<string, FixtureResolution>();

  const resolve = (group: string): FixtureResolution => {
    const direct = fixtures.find((fixture) => entryOf(fixture)?.group === group);
    if (direct) return { fixture: direct, rule: "group" };
    const service = dominantMainService(source.classifier.filter((entry) => entry.group === group));
    const byService = service && fixtures.find((fixture) => entryOf(fixture)?.mainService === service);
    if (byService) return { fixture: byService, rule: "mainService" };
    return { fixture: fallback, rule: "default" };
  };

  return (group) => {
    const cached = cache.get(group) ?? resolve(group);
    cache.set(group, cached);
    return cached;
  };
}

let defaultResolver: FixtureResolver | undefined;

function getDefaultResolver(): FixtureResolver {
  defaultResolver ??= createFixtureResolver({ fixtures: readArmFixtures(), classifier: readClassifier() });
  return defaultResolver;
}

/** Фикстура для экранного рендера учебной карточки (данные ридера — замороженные, не мутировать). */
export function resolveArmFixture(card: Pick<IncidentCard, "group">): ArmCardFixture {
  return getDefaultResolver()(card.group).fixture;
}

/** Id фикстуры учебной карточки (resolvedFixtureId в GET /api/mock/cards/[id]). */
export function resolveArmFixtureId(card: Pick<IncidentCard, "group">): string {
  return resolveArmFixture(card).id;
}

/** Фикстура с правилом, по которому она выбрана (диагностика/тесты). */
export function resolveArmFixtureWithRule(card: Pick<IncidentCard, "group">): FixtureResolution {
  return getDefaultResolver()(card.group);
}

/** Номер учебной карточки в списке: цифры id («c-007» → 7), чтобы номера не совпадали с фикстурами. */
const TRAINING_ID_DIGITS = /\d+/;

/**
 * Списочная проекция учебной карточки (T1.2-04): фикстура её группы (правило выше) как основа экранного рендера
 * (тип, классификатор, признаки, источник, дата, оператор), поверх — данные самой учебной карточки:
 * id/номер, заявитель и его телефон (АОН), адрес, фабула → описание. Округ/район и координаты в учебных
 * данных не заданы — пустые (фильтры по ним учебную карточку честно не находят). Статус — «Зарегистрирована»:
 * учебная карточка ещё не обработана. Отработки и оповещения служб — пусты (выбор служб — задача курсанта,
 * эталон expectedServices/expectedTags в проекцию не переносится).
 */
export function projectTrainingCard(card: IncidentCard): ArmCardFixture {
  const fixture = structuredClone(resolveArmFixture(card));
  delete fixture.smsList;
  return {
    ...fixture,
    id: card.id,
    number: Number(TRAINING_ID_DIGITS.exec(card.id)?.[0] ?? 0),
    cardStatus: "registered",
    phones: { aon: card.caller.phone, provided: card.caller.phone, onSite: "" },
    applicant: { name: card.caller.name, status: card.caller.status ?? fixture.applicant.status },
    address: {
      formal: card.address,
      okrug: "",
      raion: "",
      descriptive: card.addressRefined ?? "",
      geo: null,
    },
    description: card.summary,
    workLines: [],
    notificationList: [],
  };
}
