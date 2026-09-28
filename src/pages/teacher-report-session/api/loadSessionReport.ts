/* Загрузка отчёта о занятии: один проход по мок-API, дальше страница работает с готовыми данными. */
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import { ApiError } from "@/shared/api";
import type {
  CardDetails,
  CardEventContract,
  DdsStatusDef,
  Evaluation,
  GroupReport,
  ReportContract,
  ReportJournalRow,
  SessionContract,
  SessionErrorSummaryResponse,
} from "@/shared/api";

import { defaultReportApi } from "./reportApi";
import type { ReportApi } from "./reportApi";

export type EvaluatedAttempt = CardEventContract & { evaluation: Evaluation };

export type CardCaption = { number: string; type: string };

export type SessionReportData = {
  sessionId: string;
  /** Шапка занятия: дата, преподаватель, категории, режим, время формирования отчёта. */
  row: ReportJournalRow | null;
  reports: ReportContract[];
  groupReport: GroupReport | null;
  attempts: EvaluatedAttempt[];
  captions: Record<string, CardCaption>;
  ddsStatuses: DdsStatusDef[];
  errorSummary?: SessionErrorSummaryResponse | null;
};

const UNKNOWN_TYPE = "—";

function toCaption(details: CardDetails): CardCaption {
  if (details.kind === "fixture") {
    return { number: String(details.card.number), type: details.card.what.finalType };
  }
  return { number: details.card.id, type: details.card.group ?? UNKNOWN_TYPE };
}

/** № и тип карточки: учебная c-NNN показывается сопоставленной фикстурой ПОВ-112. */
async function loadCaption(api: ReportApi, cardId: string, signal?: AbortSignal): Promise<CardCaption> {
  try {
    return toCaption(await api.getCard(TRAINING_CARD_FIXTURE_IDS[cardId] ?? cardId, signal));
  } catch (error) {
    if (error instanceof ApiError && error.code === "notFound") {
      return { number: cardId, type: UNKNOWN_TYPE };
    }
    throw error;
  }
}

async function loadCaptions(api: ReportApi, cardIds: string[], signal?: AbortSignal) {
  const unique = [...new Set(cardIds)];
  const captions = await Promise.all(unique.map((cardId) => loadCaption(api, cardId, signal)));
  return Object.fromEntries(unique.map((cardId, index) => [cardId, captions[index]]));
}

/** Оценка попытки из мок-API (учитывает правку преподавателя); не готова — берём оценку занятия. */
async function loadEvaluation(api: ReportApi, attempt: CardEventContract, signal?: AbortSignal) {
  try {
    return await api.getAttemptEvaluation(attempt.id, signal);
  } catch (error) {
    if (error instanceof ApiError && error.code === "evaluationPending") return attempt.evaluation ?? null;
    throw error;
  }
}

function findSession(sessions: SessionContract[], sessionId: string): SessionContract | undefined {
  return sessions.find((session) => session.id === sessionId);
}

export async function loadSessionReport(
  sessionId: string,
  api: ReportApi = defaultReportApi,
  signal?: AbortSignal,
): Promise<SessionReportData> {
  const errorSummaryPromise = api.getSessionErrorSummary
    ? api.getSessionErrorSummary(sessionId, signal).catch(() => null)
    : Promise.resolve(null);

  const [reportsResponse, journal, sessions, reference, errorSummary] = await Promise.all([
    api.getReports(sessionId, signal),
    api.getReportJournal({ teacherId: undefined }, signal),
    api.listSessions(undefined, signal),
    api.getReference(signal),
    errorSummaryPromise,
  ]);
  const session = findSession(sessions, sessionId);
  const cardEvents = session?.cardEvents ?? [];
  const [evaluations, captions] = await Promise.all([
    Promise.all(cardEvents.map((attempt) => loadEvaluation(api, attempt, signal))),
    loadCaptions(
      api,
      cardEvents.map((attempt) => attempt.cardId),
      signal,
    ),
  ]);
  return {
    sessionId,
    row: journal.rows.find((row) => row.sessionId === sessionId) ?? null,
    reports: reportsResponse.reports,
    groupReport: reportsResponse.groupReport,
    attempts: cardEvents.flatMap((attempt, index) => {
      const evaluation = evaluations[index];
      return evaluation ? [{ ...attempt, evaluation }] : [];
    }),
    captions,
    ddsStatuses: reference.ddsStatuses,
    errorSummary,
  };
}
