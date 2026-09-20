import type { LinkedCard } from "@/widgets/incident-card";
import {
  getCard,
  getClassifier,
  getReference,
  listScenarios,
  listSessions,
  postCardAttempt,
  postCardLinks,
} from "@/shared/api";
import type {
  ArmCardFixtureContract,
  CardAttemptResponse,
  CardDetails,
  CardRuntimeState,
  ClassifierEntry,
  ReferenceData,
  Scenario,
  SessionContract,
} from "@/shared/api";

import { mergeTrainingCard } from "../lib/cardView";
import { resolveLinkChain, toLinkedCard } from "../lib/links";

/** Всё, что нужно экрану карточки: данные, справочники, сценарий, попытка курсанта. */
export type IncidentData = {
  card: ArmCardFixtureContract;
  kind: CardDetails["kind"];
  runtime: CardRuntimeState;
  reference: ReferenceData;
  classifierEntries: ClassifierEntry[];
  scenario: Scenario | null;
  linkedCards: LinkedCard[];
  sessions: SessionContract[];
  attempt: CardAttemptResponse;
};

export type LoadIncidentInput = { cardId: string; studentId: string; issuedAt?: string };

/* Открытие попытки идемпотентно на сервере; параллельные запросы (StrictMode) склеиваются на клиенте. */
const attemptRequests = new Map<string, Promise<CardAttemptResponse>>();

export function openAttemptOnce(cardId: string, studentId: string, issuedAt?: string) {
  const key = `${studentId}:${cardId}`;
  const pending = attemptRequests.get(key) ?? postCardAttempt(cardId, { studentId, issuedAt });
  attemptRequests.set(key, pending);
  pending.finally(() => attemptRequests.delete(key)).catch(() => undefined);
  return pending;
}

async function resolveCardView(details: CardDetails, signal: AbortSignal): Promise<ArmCardFixtureContract> {
  if (details.kind === "fixture") return details.card;
  if (!details.resolvedFixtureId) throw new Error("Для учебной карточки не найдена рабочая карточка ПОВ-112");
  const fixture = await getCard(details.resolvedFixtureId, signal);
  if (fixture.kind !== "fixture") throw new Error("Некорректная связка учебной карточки и фикстуры");
  return mergeTrainingCard(details.card, fixture.card);
}

async function loadLinkedCards(cardId: string, signal: AbortSignal): Promise<LinkedCard[]> {
  const { chain } = await postCardLinks(cardId);
  const others = resolveLinkChain(cardId, chain).filter((link) => link.cardId !== cardId);
  const details = await Promise.all(
    others.map((link) => getCard(link.cardId, signal).catch(() => undefined)),
  );
  return others.map((link, index) => toLinkedCard(link, details[index]));
}

function findScenario(scenarios: Scenario[], sessions: SessionContract[], cardId: string): Scenario | null {
  const sessionScenarioIds = new Set(sessions.flatMap((session) => session.scenarioIds));
  const withCard = scenarios.filter((scenario) => scenario.cardIds.includes(cardId));
  return withCard.find((scenario) => sessionScenarioIds.has(scenario.id)) ?? withCard[0] ?? null;
}

/** Загрузка карточки через мок-слой (GET /cards/[id] + фикстура учебной карточки) и открытие попытки. */
export async function loadIncident(input: LoadIncidentInput, signal: AbortSignal): Promise<IncidentData> {
  const { cardId, studentId, issuedAt } = input;
  const [details, reference, scenarios, sessions] = await Promise.all([
    getCard(cardId, signal),
    getReference(signal),
    listScenarios(undefined, signal),
    /* Занятия нужны для сценария и «Следующей карточки»; без них карточка всё равно открывается. */
    listSessions({ studentId }, signal).catch((): SessionContract[] => []),
  ]);
  const card = await resolveCardView(details, signal);
  const [classifierEntries, linkedCards, attempt] = await Promise.all([
    card.what.classifierCode
      ? getClassifier({ code: card.what.classifierCode }, signal)
      : Promise.resolve([]),
    loadLinkedCards(cardId, signal),
    openAttemptOnce(cardId, studentId, issuedAt),
  ]);
  return {
    card,
    kind: details.kind,
    runtime: details.runtime,
    reference,
    classifierEntries,
    scenario: findScenario(scenarios, sessions, cardId),
    linkedCards,
    sessions,
    attempt,
  };
}
