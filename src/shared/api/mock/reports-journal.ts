/*
 * Журнал отчётов преподавателя GET /api/mock/reports/journal (T3.4-02, T3.4-03).
 * Строка = занятие: дата, группа, категории карточек, курсанты, средний балл, статус отчёта.
 * Фильтры (период / группа / курсант / категория) применяются здесь, значения фильтров считаются
 * по всему журналу преподавателя — список не схлопывается после применения фильтра.
 * Обучающемуся журнал недоступен (ТЗ §8, spec/02-roles.md): его данные — только GET /reports?studentId=.
 */
import type {
  ReportJournalFilters,
  ReportJournalQuery,
  ReportJournalResponse,
  ReportJournalRow,
  ReportJournalStudent,
  Session,
  User,
} from "../types";
import { readCards, readGroupReport, readReports, readUsers } from "./readers";
import { readStringParam } from "./request";
import { ensureSessionReport } from "./reports-runtime";
import type { RuntimeReportDeps } from "./reports-runtime";
import { recomputeReportScore } from "./reports-score";
import { forbidden } from "./respond";
import { findStoredGroupReport, listStoredSessionReports } from "./store-reports";
import { listStoredSessions } from "./store-training";
import { isStudentViewer } from "./viewer";
import type { MockViewer } from "./viewer";

const MS_IN_SECOND = 1000;
/** "2026-09-16" — часть ISO-метки, по которой сравнивается период фильтра. */
const ISO_DATE_LENGTH = 10;

export const JOURNAL_TEACHER_ONLY_MESSAGE = "Журнал отчётов доступен преподавателю и администратору";

function toStudents(session: Session, users: readonly User[]): ReportJournalStudent[] {
  return session.studentIds.map((studentId) => ({
    id: studentId,
    fullName: users.find((user) => user.id === studentId)?.fullName ?? studentId,
  }));
}

function toGroups(session: Session, users: readonly User[]): string[] {
  const groups = session.studentIds.flatMap(
    (studentId) => users.find((user) => user.id === studentId)?.group ?? [],
  );
  return Array.from(new Set(groups));
}

function toCategories(session: Session): string[] {
  const cardIds = new Set(session.cardFlow.map((flowItem) => flowItem.cardId));
  const cards = readCards().filter((card) => cardIds.has(card.id));
  return Array.from(new Set(cards.map((card) => card.group)));
}

/** ТЗ §7: сколько секунд заняло формирование отчёта после завершения занятия; нет данных — null. */
function toBuildSec(generatedAt: string | null, finishedAt: string | null | undefined): number | null {
  if (!generatedAt || !finishedAt) return null;
  const elapsedMs = Date.parse(generatedAt) - Date.parse(finishedAt);
  return elapsedMs < 0 ? null : Math.round(elapsedMs / MS_IN_SECOND);
}

function buildRow(session: Session, users: readonly User[]): ReportJournalRow {
  const staticGroupReport = readGroupReport();
  const groupReport =
    staticGroupReport.sessionId === session.id ? staticGroupReport : findStoredGroupReport(session.id);
  const reports = [
    ...readReports().filter((report) => report.sessionId === session.id),
    ...listStoredSessionReports(session.id),
  ].map((report) => recomputeReportScore(report, session));
  const scores = reports.map((report) => report.score);
  const generatedAt = groupReport?.generatedAt ?? reports[0]?.generatedAt ?? null;
  return {
    sessionId: session.id,
    teacherId: session.teacherId,
    teacherName: users.find((user) => user.id === session.teacherId)?.fullName ?? session.teacherId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt ?? null,
    groups: toGroups(session, users),
    categories: toCategories(session),
    students: toStudents(session, users),
    averageScore:
      scores.length === 0 ? null : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    status: groupReport ? "ready" : "draft",
    mode: session.mode,
    cardSource: session.cardSource,
    generatedAt,
    buildSec: toBuildSec(generatedAt, session.finishedAt),
  };
}

function matchesQuery(row: ReportJournalRow, query: ReportJournalQuery): boolean {
  const date = row.startedAt.slice(0, ISO_DATE_LENGTH);
  return (
    (!query.studentId || row.students.some((student) => student.id === query.studentId)) &&
    (!query.group || row.groups.includes(query.group)) &&
    (!query.category || row.categories.includes(query.category)) &&
    (!query.from || date >= query.from) &&
    (!query.to || date <= query.to)
  );
}

function collectFilters(rows: ReportJournalRow[]): ReportJournalFilters {
  const students = new Map(rows.flatMap((row) => row.students).map((student) => [student.id, student]));
  return {
    groups: Array.from(new Set(rows.flatMap((row) => row.groups))),
    students: Array.from(students.values()),
    categories: Array.from(new Set(rows.flatMap((row) => row.categories))),
  };
}

export function readJournalQuery(params: URLSearchParams): ReportJournalQuery {
  return {
    teacherId: readStringParam(params, "teacherId"),
    studentId: readStringParam(params, "studentId"),
    group: readStringParam(params, "group"),
    category: readStringParam(params, "category"),
    from: readStringParam(params, "from"),
    to: readStringParam(params, "to"),
  };
}

/**
 * Журнал занятий преподавателя, новые сверху; без teacherId — все занятия мока.
 * Перед сборкой строк отчёты завершённых занятий формируются (идемпотентно): иначе у занятия,
 * проведённого в этом процессе, шапка отчёта показывала бы «Отчёт ещё не сформирован» (buildSec = null).
 */
export async function getReportJournal(
  params: URLSearchParams,
  viewer: MockViewer | null = null,
  deps: RuntimeReportDeps | null = null,
): Promise<ReportJournalResponse> {
  if (isStudentViewer(viewer)) throw forbidden(JOURNAL_TEACHER_ONLY_MESSAGE);
  const query = readJournalQuery(params);
  const users = readUsers();
  if (deps) {
    for (const session of listStoredSessions()) await ensureSessionReport(session.id, deps);
  }
  const allRows = listStoredSessions()
    .filter((session) => !query.teacherId || session.teacherId === query.teacherId)
    .map((session) => buildRow(session, users))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return { rows: allRows.filter((row) => matchesQuery(row, query)), filters: collectFilters(allRows) };
}
