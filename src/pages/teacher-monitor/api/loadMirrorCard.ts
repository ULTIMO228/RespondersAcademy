/*
 * Данные зеркала экрана курсанта (T3.3-07): та же карточка, что открыта у курсанта, и её опросная карта.
 * Учебная c-NNN рендерится поверх UI-фикстуры ПОВ-112 (общее правило entities/incident.mergeTrainingCard),
 * поэтому преподаватель видит ровно тот же экран — не видеострим, а тот же рендер по данным мок-слоя.
 */
import { mergeTrainingCard } from "@/entities/incident";
import type { MonitorApi } from "@/widgets/monitor-grid";
import type { ArmCardFixtureContract, CardDetails, ClassifierEntry } from "@/shared/api";

export type MirrorCard = {
  card: ArmCardFixtureContract;
  classifierEntries: ClassifierEntry[];
};

async function resolveCard(
  api: MonitorApi,
  details: CardDetails,
  signal: AbortSignal,
): Promise<ArmCardFixtureContract> {
  if (details.kind === "fixture") return details.card;
  if (!details.resolvedFixtureId) throw new Error("Для учебной карточки не найдена рабочая карточка ПОВ-112");
  const fixture = await api.getCard(details.resolvedFixtureId, signal);
  if (fixture.kind !== "fixture") throw new Error("Некорректная связка учебной карточки и фикстуры");
  return mergeTrainingCard(details.card, fixture.card);
}

export async function loadMirrorCard(
  api: MonitorApi,
  cardId: string,
  signal: AbortSignal,
): Promise<MirrorCard> {
  const card = await resolveCard(api, await api.getCard(cardId, signal), signal);
  const classifierEntries = card.what.classifierCode
    ? await api.getClassifier({ code: card.what.classifierCode }, signal)
    : [];
  return { card, classifierEntries };
}
