/*
 * Статический контекст редактора сценария: всё, что не меняется преподавателем и не должно тянуться
 * в браузер целиком (classifier.json — 3,5 МБ). Считает серверный компонент страницы; изменяемый
 * сценарий экран грузит из мок-API (GET /api/mock/scenarios/[id]).
 */
import { buildCardIndex, buildClassifierTree } from "@/features/scenario-builder";
import type { ClassifierTreeGroup, TrainingCardView } from "@/features/scenario-builder";
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import type { EtalonActionDictionary } from "@/entities/session";
import { armCardFixtures, cards, classifier, reference } from "@/shared/api";
import type { ArmCardFixture, ClassifierEntry, District, ServiceRef } from "@/shared/api";
import type { DdsStatusDef, ServiceStatusDef } from "@/shared/api";

export type ScenarioEditorContext = {
  cards: TrainingCardView[];
  /** Дерево ЕКП по группам учебных карточек: группа → отобранные записи классификатора. */
  classifierTree: Record<string, ClassifierTreeGroup>;
  /** UI-фикстуры ПОВ-112 для предпросмотра карточки-основы. */
  fixtures: ArmCardFixture[];
  /** Опросная карта фикстуры: код ЕКП → записи классификатора. */
  classifierByCode: Record<string, ClassifierEntry[]>;
  districts: District[];
  services: ServiceRef[];
  serviceStatuses: ServiceStatusDef[];
  ddsStatuses: DdsStatusDef[];
  /** Словарь русских подписей действий эталона (статусы, внутренние номера, карточки). */
  dictionary: EtalonActionDictionary;
};

/** Контекст строится один раз на процесс: данные-справочники неизменяемы. */
let cached: ScenarioEditorContext | undefined;

export function buildEditorContext(): ScenarioEditorContext {
  if (cached) return cached;
  const cardIndex = buildCardIndex(cards, classifier, (cardId) => TRAINING_CARD_FIXTURE_IDS[cardId]);
  const groups = Array.from(new Set(cardIndex.map((card) => card.group)));
  const classifierTree: Record<string, ClassifierTreeGroup> = {};
  for (const group of groups) {
    const groupCards = cardIndex.filter((card) => card.group === group);
    const [tree] = buildClassifierTree(groupCards, classifier);
    if (tree) classifierTree[group] = tree;
  }
  const classifierByCode: Record<string, ClassifierEntry[]> = {};
  for (const fixture of armCardFixtures) {
    const code = fixture.what.classifierCode;
    if (!code || classifierByCode[code]) continue;
    classifierByCode[code] = classifier.filter((entry) => entry.code === code);
  }
  cached = {
    cards: cardIndex,
    classifierTree,
    fixtures: armCardFixtures as unknown as ArmCardFixture[],
    classifierByCode,
    districts: reference.districts,
    services: reference.services,
    serviceStatuses: reference.serviceStatuses,
    ddsStatuses: reference.ddsStatuses,
    dictionary: {
      statusTitles: Object.fromEntries(reference.ddsStatuses.map((ref) => [ref.status, ref.title])),
      numberTitles: Object.fromEntries(reference.internalNumbers.map((ref) => [ref.number, ref.title])),
      cardLabels: Object.fromEntries(
        cardIndex.map((card) => {
          const fixture = armCardFixtures.find((candidate) => candidate.id === card.fixtureId);
          return [card.id, fixture ? String(fixture.number) : card.id];
        }),
      ),
    },
  };
  return cached;
}
