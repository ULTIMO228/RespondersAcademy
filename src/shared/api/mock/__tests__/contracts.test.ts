// @vitest-environment node
/*
 * Контрактные тесты ВСЕХ route handlers мок-слоя (T1.3-02) — чек-лист полноты: таблица эндпоинтов
 * spec/000-фронт/03-architecture.md. Вызываются публичные экспорты корневых app/api/mock/** (route.ts) с Request;
 * каждый негативный кейс проверяет единый формат ошибки `{ error: { code, message } }`.
 * Изоляция: resetMockStore() в beforeEach, порядок кейсов перемешивается (shuffle) — тесты не зависят от него.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adminAudit from "../../../../../app/api/mock/admin/audit/route";
import * as adminServices from "../../../../../app/api/mock/admin/services/route";
import * as adminSettings from "../../../../../app/api/mock/admin/settings/route";
import * as adminUserBlock from "../../../../../app/api/mock/admin/users/[id]/block/route";
import * as adminUserResetPassword from "../../../../../app/api/mock/admin/users/[id]/reset-password/route";
import * as adminUser from "../../../../../app/api/mock/admin/users/[id]/route";
import * as adminToggle from "../../../../../app/api/mock/admin/users/[id]/toggle-active/route";
import * as adminUserUnblock from "../../../../../app/api/mock/admin/users/[id]/unblock/route";
import * as adminUsers from "../../../../../app/api/mock/admin/users/route";
import * as systemLogs from "../../../../../app/api/mock/admin/system/logs/route";
import * as systemMonitoring from "../../../../../app/api/mock/admin/system/monitoring/route";
import * as systemServiceAction from "../../../../../app/api/mock/admin/system/services/[id]/action/route";
import * as systemServices from "../../../../../app/api/mock/admin/system/services/route";
import * as systemSettings from "../../../../../app/api/mock/admin/system/settings/route";
import * as systemUsageStats from "../../../../../app/api/mock/admin/system/usage-stats/route";
import * as evaluation from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import * as login from "../../../../../app/api/mock/auth/login/route";
import * as cardLinks from "../../../../../app/api/mock/cards/[id]/links/route";
import * as cardRecordings from "../../../../../app/api/mock/cards/[id]/recordings/route";
import * as cardReminders from "../../../../../app/api/mock/cards/[id]/reminders/route";
import * as card from "../../../../../app/api/mock/cards/[id]/route";
import * as cardSms from "../../../../../app/api/mock/cards/[id]/sms/route";
import * as cardStatus from "../../../../../app/api/mock/cards/[id]/status/route";
import * as cardWorkLines from "../../../../../app/api/mock/cards/[id]/worklines/route";
import * as cards from "../../../../../app/api/mock/cards/route";
import * as classifier from "../../../../../app/api/mock/classifier/route";
import * as reference from "../../../../../app/api/mock/reference/route";
import * as reportFeedback from "../../../../../app/api/mock/reports/feedback/route";
import * as reportJournal from "../../../../../app/api/mock/reports/journal/route";
import * as reports from "../../../../../app/api/mock/reports/route";
import * as scenarioValidate from "../../../../../app/api/mock/scenarios/[id]/validate/route";
import * as scenarios from "../../../../../app/api/mock/scenarios/route";
import * as sessionFeed from "../../../../../app/api/mock/sessions/[id]/feed/route";
import * as sessionControl from "../../../../../app/api/mock/sessions/[id]/control/route";
import * as sessionStart from "../../../../../app/api/mock/sessions/[id]/start/route";
import * as sessionStop from "../../../../../app/api/mock/sessions/[id]/stop/route";
import * as sessions from "../../../../../app/api/mock/sessions/route";
import * as users from "../../../../../app/api/mock/users/route";
import type { ApiErrorBody, ApiErrorCode } from "../../types";
import { readScenarios } from "../readers";
import { resetMockStore } from "../store";
import { findStoredUser } from "../store-admin";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Method = "GET" | "POST" | "PATCH";

type ContractCase = {
  /** Строка таблицы 03-architecture.md, которую покрывает кейс. */
  endpoint: string;
  method: Method;
  handler: Handler;
  /** Путь с query (для отчёта и URL запроса). */
  path: string;
  id?: string;
  body?: unknown;
  status: number;
  /** Код ошибки для негативных кейсов (проверяется формат ApiErrorBody). */
  code?: ApiErrorCode;
  /** Подготовка состояния через публичные handlers; возвращает id для params (вместо id). */
  prepare?: () => Promise<string>;
};

const BASE = "http://localhost/api/mock";
const NOW = new Date("2026-09-19T09:00:00Z");
const TEACHER_ID = "u-002";
const ADMIN_ID = "u-001";
const RUNNING = "ses-2026-09-17-demo";
const FINISHED = "ses-2026-09-16-01";

function scenarioDraft(): Record<string, unknown> {
  const { id, validation, ...rest } = structuredClone(readScenarios()[0]);
  void id;
  void validation;
  return { ...rest, title: "Контрактный сценарий" };
}

const sessionWizard = {
  teacherId: TEACHER_ID,
  studentIds: ["u-005"],
  scenarioIds: ["s-001"],
  mode: "practice",
  cardSource: "generated",
};

async function send(item: ContractCase): Promise<Response> {
  const init: RequestInit = { method: item.method };
  if (item.body !== undefined) {
    init.body = typeof item.body === "string" ? item.body : JSON.stringify(item.body);
  }
  const id = item.prepare ? await item.prepare() : (item.id ?? "");
  return item.handler(new Request(`${BASE}${item.path.replace(":id", id)}`, init), {
    params: Promise.resolve({ id }),
  });
}

/** Новое занятие мастера (state configured) через POST /sessions. */
async function createConfiguredSession(): Promise<string> {
  const request = new Request(`${BASE}/sessions`, { method: "POST", body: JSON.stringify(sessionWizard) });
  return ((await (await sessions.POST(request)).json()) as { id: string }).id;
}

const q = encodeURIComponent;

/* Таблица кейсов: по строке эндпоинта — 200/201 + негативные 400/401/403/404/409 там, где они есть. */
const CASES: ContractCase[] = [
  // POST /auth/login
  {
    endpoint: "POST /auth/login",
    method: "POST",
    handler: login.POST,
    path: "/auth/login",
    body: { login: "admin", password: "admin112", armNumber: 24 },
    status: 200,
  },
  {
    endpoint: "POST /auth/login",
    method: "POST",
    handler: login.POST,
    path: "/auth/login",
    body: "{",
    status: 400,
    code: "badRequest",
  },
  {
    endpoint: "POST /auth/login",
    method: "POST",
    handler: login.POST,
    path: "/auth/login",
    body: { login: "admin", password: "wrong", armNumber: 24 },
    status: 401,
    code: "unauthorized",
  },
  {
    endpoint: "POST /auth/login",
    method: "POST",
    handler: login.POST,
    path: "/auth/login",
    body: { login: "egorov", password: "student112", armNumber: 6 },
    status: 403,
    code: "accountBlocked",
  },
  // GET /cards
  {
    endpoint: "GET /cards",
    method: "GET",
    handler: cards.GET,
    path: "/cards?page=1&perPage=10",
    status: 200,
  },
  {
    endpoint: "GET /cards",
    method: "GET",
    handler: cards.GET,
    path: `/cards?okrug=${q("ЮАО")}&cardStatus=registered`,
    status: 200,
  },
  {
    endpoint: "GET /cards",
    method: "GET",
    handler: cards.GET,
    path: "/cards?perPage=abc",
    status: 400,
    code: "badRequest",
  },
  {
    endpoint: "GET /cards",
    method: "GET",
    handler: cards.GET,
    path: "/cards?cardStatus=nope",
    status: 400,
    code: "badRequest",
  },
  // GET /cards/[id]
  {
    endpoint: "GET /cards/[id]",
    method: "GET",
    handler: card.GET,
    path: "/cards/card-881412",
    id: "card-881412",
    status: 200,
  },
  {
    endpoint: "GET /cards/[id]",
    method: "GET",
    handler: card.GET,
    path: "/cards/c-001",
    id: "c-001",
    status: 200,
  },
  {
    endpoint: "GET /cards/[id]",
    method: "GET",
    handler: card.GET,
    path: "/cards/nope",
    id: "nope",
    status: 404,
    code: "notFound",
  },
  // POST /cards/[id]/status
  {
    endpoint: "POST /cards/[id]/status",
    method: "POST",
    handler: cardStatus.POST,
    path: "/cards/card-881412/status",
    id: "card-881412",
    body: { ddsStatus: "accepted" },
    status: 200,
  },
  {
    endpoint: "POST /cards/[id]/status",
    method: "POST",
    handler: cardStatus.POST,
    path: "/cards/card-881412/status",
    id: "card-881412",
    body: { ddsStatus: "notAccepted" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /cards/[id]/status",
    method: "POST",
    handler: cardStatus.POST,
    path: "/cards/card-881412/status",
    id: "card-881412",
    body: { ddsStatus: "flying" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /cards/[id]/status",
    method: "POST",
    handler: cardStatus.POST,
    path: "/cards/card-881412/status",
    id: "card-881412",
    body: { ddsStatus: "workDone" },
    status: 409,
    code: "invalidTransition",
  },
  {
    endpoint: "POST /cards/[id]/status",
    method: "POST",
    handler: cardStatus.POST,
    path: "/cards/card-000/status",
    id: "card-000",
    body: { ddsStatus: "accepted" },
    status: 404,
    code: "notFound",
  },
  // POST /cards/[id]/links
  {
    endpoint: "POST /cards/[id]/links",
    method: "POST",
    handler: cardLinks.POST,
    path: "/cards/c-002/links",
    id: "c-002",
    body: {},
    status: 200,
  },
  {
    endpoint: "POST /cards/[id]/links",
    method: "POST",
    handler: cardLinks.POST,
    path: "/cards/c-999/links",
    id: "c-999",
    body: {},
    status: 404,
    code: "notFound",
  },
  // POST /cards/[id]/worklines
  {
    endpoint: "POST /cards/[id]/worklines",
    method: "POST",
    handler: cardWorkLines.POST,
    path: "/cards/card-881412/worklines",
    id: "card-881412",
    body: { service: "101", calledTo: "ЦУКС", person: "Петров", message: "Передано", confirmed: true },
    status: 201,
  },
  {
    endpoint: "POST /cards/[id]/worklines",
    method: "POST",
    handler: cardWorkLines.POST,
    path: "/cards/card-881412/worklines",
    id: "card-881412",
    body: { service: "101" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /cards/[id]/worklines",
    method: "POST",
    handler: cardWorkLines.POST,
    path: "/cards/nope/worklines",
    id: "nope",
    body: {},
    status: 404,
    code: "notFound",
  },
  // POST /cards/[id]/reminders
  {
    endpoint: "POST /cards/[id]/reminders",
    method: "POST",
    handler: cardReminders.POST,
    path: "/cards/c-001/reminders",
    id: "c-001",
    body: { text: "Перезвонить", remindAt: "2026-09-19T12:30:00+03:00" },
    status: 201,
  },
  {
    endpoint: "POST /cards/[id]/reminders",
    method: "POST",
    handler: cardReminders.POST,
    path: "/cards/c-001/reminders",
    id: "c-001",
    body: { text: "Перезвонить", remindAt: "завтра" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /cards/[id]/reminders",
    method: "POST",
    handler: cardReminders.POST,
    path: "/cards/nope/reminders",
    id: "nope",
    body: {},
    status: 404,
    code: "notFound",
  },
  // GET/POST /cards/[id]/sms
  {
    endpoint: "GET /cards/[id]/sms",
    method: "GET",
    handler: cardSms.GET,
    path: "/cards/card-36814859/sms",
    id: "card-36814859",
    status: 200,
  },
  {
    endpoint: "GET /cards/[id]/sms",
    method: "GET",
    handler: cardSms.GET,
    path: "/cards/nope/sms",
    id: "nope",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /cards/[id]/sms",
    method: "POST",
    handler: cardSms.POST,
    path: "/cards/card-36814859/sms",
    id: "card-36814859",
    body: { text: "Бригада выехала" },
    status: 201,
  },
  {
    endpoint: "POST /cards/[id]/sms",
    method: "POST",
    handler: cardSms.POST,
    path: "/cards/card-36814859/sms",
    id: "card-36814859",
    body: { text: " " },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /cards/[id]/sms",
    method: "POST",
    handler: cardSms.POST,
    path: "/cards/nope/sms",
    id: "nope",
    body: { text: "Бригада выехала" },
    status: 404,
    code: "notFound",
  },
  // GET /cards/[id]/recordings
  {
    endpoint: "GET /cards/[id]/recordings",
    method: "GET",
    handler: cardRecordings.GET,
    path: "/cards/card-881412/recordings",
    id: "card-881412",
    status: 200,
  },
  {
    endpoint: "GET /cards/[id]/recordings",
    method: "GET",
    handler: cardRecordings.GET,
    path: "/cards/nope/recordings",
    id: "nope",
    status: 404,
    code: "notFound",
  },
  // GET /classifier, GET /reference
  {
    endpoint: "GET /classifier",
    method: "GET",
    handler: classifier.GET,
    path: `/classifier?group=${q("пожар на улице")}`,
    status: 200,
  },
  { endpoint: "GET /reference", method: "GET", handler: reference.GET, path: "/reference", status: 200 },
  // GET/POST /scenarios, POST /scenarios/[id]/validate
  {
    endpoint: "GET /scenarios",
    method: "GET",
    handler: scenarios.GET,
    path: "/scenarios?validationStatus=pending",
    status: 200,
  },
  {
    endpoint: "GET /scenarios",
    method: "GET",
    handler: scenarios.GET,
    path: "/scenarios?difficulty=7",
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /scenarios",
    method: "POST",
    handler: scenarios.POST,
    path: "/scenarios",
    body: scenarioDraft(),
    status: 201,
  },
  {
    endpoint: "POST /scenarios",
    method: "POST",
    handler: scenarios.POST,
    path: "/scenarios",
    body: { ...scenarioDraft(), cardIds: ["c-999"] },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /scenarios/[id]/validate",
    method: "POST",
    handler: scenarioValidate.POST,
    path: "/scenarios/s-033/validate",
    id: "s-033",
    body: { action: "approve", reviewedBy: TEACHER_ID },
    status: 200,
  },
  {
    endpoint: "POST /scenarios/[id]/validate",
    method: "POST",
    handler: scenarioValidate.POST,
    path: "/scenarios/s-033/validate",
    id: "s-033",
    body: { action: "approve", reviewedBy: "u-005" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /scenarios/[id]/validate",
    method: "POST",
    handler: scenarioValidate.POST,
    path: "/scenarios/s-001/validate",
    id: "s-001",
    body: { action: "approve", reviewedBy: TEACHER_ID },
    status: 409,
    code: "invalidTransition",
  },
  {
    endpoint: "POST /scenarios/[id]/validate",
    method: "POST",
    handler: scenarioValidate.POST,
    path: "/scenarios/s-999/validate",
    id: "s-999",
    body: { action: "approve", reviewedBy: TEACHER_ID },
    status: 404,
    code: "notFound",
  },
  // GET/POST /sessions, start, stop, feed
  {
    endpoint: "GET /sessions",
    method: "GET",
    handler: sessions.GET,
    path: `/sessions?teacherId=${TEACHER_ID}`,
    status: 200,
  },
  {
    endpoint: "GET /sessions",
    method: "GET",
    handler: sessions.GET,
    path: "/sessions?state=x",
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /sessions",
    method: "POST",
    handler: sessions.POST,
    path: "/sessions",
    body: sessionWizard,
    status: 201,
  },
  {
    endpoint: "POST /sessions",
    method: "POST",
    handler: sessions.POST,
    path: "/sessions",
    body: { ...sessionWizard, studentIds: [] },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /sessions/[id]/start",
    method: "POST",
    handler: sessionStart.POST,
    path: "/sessions/:id/start",
    prepare: createConfiguredSession,
    status: 200,
  },
  {
    endpoint: "POST /sessions/[id]/start",
    method: "POST",
    handler: sessionStart.POST,
    path: `/sessions/${RUNNING}/start`,
    id: RUNNING,
    status: 409,
    code: "invalidTransition",
  },
  {
    endpoint: "POST /sessions/[id]/start",
    method: "POST",
    handler: sessionStart.POST,
    path: "/sessions/ses-nope/start",
    id: "ses-nope",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /sessions/[id]/stop",
    method: "POST",
    handler: sessionStop.POST,
    path: `/sessions/${RUNNING}/stop`,
    id: RUNNING,
    status: 200,
  },
  {
    endpoint: "POST /sessions/[id]/stop",
    method: "POST",
    handler: sessionStop.POST,
    path: `/sessions/${FINISHED}/stop`,
    id: FINISHED,
    status: 409,
    code: "invalidTransition",
  },
  {
    endpoint: "POST /sessions/[id]/stop",
    method: "POST",
    handler: sessionStop.POST,
    path: "/sessions/ses-nope/stop",
    id: "ses-nope",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "GET /sessions/[id]/feed",
    method: "GET",
    handler: sessionFeed.GET,
    path: `/sessions/${FINISHED}/feed`,
    id: FINISHED,
    status: 200,
  },
  {
    endpoint: "GET /sessions/[id]/feed",
    method: "GET",
    handler: sessionFeed.GET,
    path: `/sessions/${RUNNING}/feed?since=${q("вчера")}`,
    id: RUNNING,
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "GET /sessions/[id]/feed",
    method: "GET",
    handler: sessionFeed.GET,
    path: "/sessions/ses-nope/feed",
    id: "ses-nope",
    status: 404,
    code: "notFound",
  },
  // GET/POST /sessions/[id]/control, GET /users
  {
    endpoint: "GET /sessions/[id]/control",
    method: "GET",
    handler: sessionControl.GET,
    path: `/sessions/${RUNNING}/control`,
    id: RUNNING,
    status: 200,
  },
  {
    endpoint: "GET /sessions/[id]/control",
    method: "GET",
    handler: sessionControl.GET,
    path: "/sessions/ses-nope/control",
    id: "ses-nope",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /sessions/[id]/control",
    method: "POST",
    handler: sessionControl.POST,
    path: `/sessions/${RUNNING}/control`,
    id: RUNNING,
    body: { action: "pause" },
    status: 200,
  },
  {
    endpoint: "POST /sessions/[id]/control",
    method: "POST",
    handler: sessionControl.POST,
    path: `/sessions/${RUNNING}/control`,
    id: RUNNING,
    body: { action: "restart" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /sessions/[id]/control",
    method: "POST",
    handler: sessionControl.POST,
    path: `/sessions/${RUNNING}/control`,
    id: RUNNING,
    body: { action: "report" },
    status: 409,
    code: "invalidTransition",
  },
  {
    endpoint: "GET /users",
    method: "GET",
    handler: users.GET,
    path: "/users?role=student&group=ДДС-01",
    status: 200,
  },
  {
    endpoint: "GET /users",
    method: "GET",
    handler: users.GET,
    path: "/users?role=director",
    status: 400,
    code: "validationFailed",
  },
  // GET /reports, GET /attempts/[id]/evaluation
  {
    endpoint: "GET /reports",
    method: "GET",
    handler: reports.GET,
    path: `/reports?sessionId=${FINISHED}`,
    status: 200,
  },
  {
    endpoint: "GET /reports",
    method: "GET",
    handler: reports.GET,
    path: "/reports",
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "GET /reports",
    method: "GET",
    handler: reports.GET,
    path: "/reports?sessionId=ses-nope",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "GET /attempts/[id]/evaluation",
    method: "GET",
    handler: evaluation.GET,
    path: "/attempts/att-01/evaluation",
    id: "att-01",
    status: 200,
  },
  {
    endpoint: "GET /attempts/[id]/evaluation",
    method: "GET",
    handler: evaluation.GET,
    path: "/attempts/att-99/evaluation",
    id: "att-99",
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "GET /reports/journal",
    method: "GET",
    handler: reportJournal.GET,
    path: `/reports/journal?teacherId=${TEACHER_ID}`,
    status: 200,
  },
  {
    endpoint: "POST /reports/feedback",
    method: "POST",
    handler: reportFeedback.POST,
    path: "/reports/feedback",
    body: { reportId: "rep-2026-09-16-01-u-005", teacherId: TEACHER_ID, text: "Разбор занятия" },
    status: 201,
  },
  {
    endpoint: "POST /reports/feedback",
    method: "POST",
    handler: reportFeedback.POST,
    path: "/reports/feedback",
    body: { reportId: "rep-nope", teacherId: TEACHER_ID, text: "Разбор занятия" },
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /attempts/[id]/evaluation",
    method: "POST",
    handler: evaluation.POST,
    path: "/attempts/att-01/evaluation",
    id: "att-01",
    body: { teacherId: TEACHER_ID, score: 90, comment: "Замечание снято" },
    status: 200,
  },
  {
    endpoint: "POST /attempts/[id]/evaluation",
    method: "POST",
    handler: evaluation.POST,
    path: "/attempts/att-01/evaluation",
    id: "att-01",
    body: { teacherId: TEACHER_ID, score: 90 },
    status: 400,
    code: "validationFailed",
  },
  // GET /admin/*
  { endpoint: "GET /admin/users", method: "GET", handler: adminUsers.GET, path: "/admin/users", status: 200 },
  {
    endpoint: "POST /admin/users/[id]/toggle-active",
    method: "POST",
    handler: adminToggle.POST,
    path: "/admin/users/u-005/toggle-active",
    id: "u-005",
    body: { adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "POST /admin/users/[id]/toggle-active",
    method: "POST",
    handler: adminToggle.POST,
    path: "/admin/users/u-005/toggle-active",
    id: "u-005",
    body: {},
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /admin/users/[id]/toggle-active",
    method: "POST",
    handler: adminToggle.POST,
    path: "/admin/users/u-005/toggle-active",
    id: "u-005",
    body: { adminId: TEACHER_ID },
    status: 403,
    code: "forbidden",
  },
  {
    endpoint: "POST /admin/users/[id]/toggle-active",
    method: "POST",
    handler: adminToggle.POST,
    path: "/admin/users/u-999/toggle-active",
    id: "u-999",
    body: { adminId: ADMIN_ID },
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /admin/users/[id]/toggle-active",
    method: "POST",
    handler: adminToggle.POST,
    path: `/admin/users/${ADMIN_ID}/toggle-active`,
    id: ADMIN_ID,
    body: { adminId: ADMIN_ID },
    status: 409,
    code: "conflict",
  },
  /* Реестр пользователей администратора (T4.1-02…T4.1-03). */
  {
    endpoint: "POST /admin/users",
    method: "POST",
    handler: adminUsers.POST,
    path: "/admin/users",
    body: {
      adminId: ADMIN_ID,
      fullName: "Контрактный Пользователь Тестович",
      login: "contract",
      password: "temp-2026",
      role: "student",
      armNumber: 90,
      group: "ДДС-01",
    },
    status: 201,
  },
  {
    endpoint: "POST /admin/users",
    method: "POST",
    handler: adminUsers.POST,
    path: "/admin/users",
    body: {
      adminId: ADMIN_ID,
      fullName: "Дубль",
      login: "admin",
      password: "x",
      role: "admin",
      armNumber: 1,
    },
    status: 409,
    code: "conflict",
  },
  {
    endpoint: "PATCH /admin/users/[id]",
    method: "PATCH",
    handler: adminUser.PATCH,
    path: "/admin/users/u-005",
    id: "u-005",
    body: { adminId: ADMIN_ID, role: "teacher" },
    status: 200,
  },
  {
    endpoint: "PATCH /admin/users/[id]",
    method: "PATCH",
    handler: adminUser.PATCH,
    path: "/admin/users/u-999",
    id: "u-999",
    body: { adminId: ADMIN_ID, fullName: "Нет такого" },
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "POST /admin/users/[id]/block",
    method: "POST",
    handler: adminUserBlock.POST,
    path: "/admin/users/u-005/block",
    id: "u-005",
    body: { adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "POST /admin/users/[id]/block",
    method: "POST",
    handler: adminUserBlock.POST,
    path: "/admin/users/u-005/block",
    id: "u-005",
    body: { adminId: "u-002" },
    status: 403,
    code: "forbidden",
  },
  {
    endpoint: "POST /admin/users/[id]/unblock",
    method: "POST",
    handler: adminUserUnblock.POST,
    path: "/admin/users/u-010/unblock",
    id: "u-010",
    body: { adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "POST /admin/users/[id]/reset-password",
    method: "POST",
    handler: adminUserResetPassword.POST,
    path: "/admin/users/u-005/reset-password",
    id: "u-005",
    body: { adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "POST /admin/users/[id]/reset-password",
    method: "POST",
    handler: adminUserResetPassword.POST,
    path: "/admin/users/u-999/reset-password",
    id: "u-999",
    body: { adminId: ADMIN_ID },
    status: 404,
    code: "notFound",
  },
  {
    endpoint: "GET /admin/services",
    method: "GET",
    handler: adminServices.GET,
    path: "/admin/services",
    status: 200,
  },
  {
    endpoint: "GET /admin/settings",
    method: "GET",
    handler: adminSettings.GET,
    path: "/admin/settings",
    status: 200,
  },
  {
    endpoint: "GET /admin/audit",
    method: "GET",
    handler: adminAudit.GET,
    path: "/admin/audit?page=1&perPage=5&type=card",
    status: 200,
  },
  {
    endpoint: "GET /admin/audit",
    method: "GET",
    handler: adminAudit.GET,
    path: "/admin/audit?type=nope",
    status: 400,
    code: "validationFailed",
  },
  // GET/POST/PATCH /admin/system/* — раздел «Система» (фаза 4.2)
  {
    endpoint: "GET /admin/system/services",
    method: "GET",
    handler: systemServices.GET,
    path: "/admin/system/services",
    status: 200,
  },
  {
    endpoint: "POST /admin/system/services/[id]/action",
    method: "POST",
    handler: systemServiceAction.POST,
    path: "/admin/system/services/:id/action",
    id: "svc-ai",
    body: { action: "start", adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "POST /admin/system/services/[id]/action",
    method: "POST",
    handler: systemServiceAction.POST,
    path: "/admin/system/services/:id/action",
    id: "svc-ai",
    body: { action: "reboot" },
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "POST /admin/system/services/[id]/action",
    method: "POST",
    handler: systemServiceAction.POST,
    path: "/admin/system/services/:id/action",
    id: "svc-nope",
    body: { action: "start" },
    status: 404,
    code: "notFound",
  },
  {
    // Занятие мока идёт: остановка критичного сервиса заблокирована (ТЗ §8).
    endpoint: "POST /admin/system/services/[id]/action",
    method: "POST",
    handler: systemServiceAction.POST,
    path: "/admin/system/services/:id/action",
    id: "svc-db",
    body: { action: "stop", adminId: ADMIN_ID },
    status: 409,
    code: "conflict",
  },
  {
    endpoint: "GET /admin/system/settings",
    method: "GET",
    handler: systemSettings.GET,
    path: "/admin/system/settings",
    status: 200,
  },
  {
    endpoint: "PATCH /admin/system/settings",
    method: "PATCH",
    handler: systemSettings.PATCH,
    path: "/admin/system/settings",
    body: { backup: { periodHours: 12 }, adminId: ADMIN_ID },
    status: 200,
  },
  {
    endpoint: "PATCH /admin/system/settings",
    method: "PATCH",
    handler: systemSettings.PATCH,
    path: "/admin/system/settings",
    body: { backup: { periodHours: 48 }, adminId: ADMIN_ID },
    status: 422,
    code: "validationFailed",
  },
  {
    endpoint: "GET /admin/system/logs",
    method: "GET",
    handler: systemLogs.GET,
    path: "/admin/system/logs?level=ERROR",
    status: 200,
  },
  {
    endpoint: "GET /admin/system/logs",
    method: "GET",
    handler: systemLogs.GET,
    path: "/admin/system/logs?level=TRACE",
    status: 400,
    code: "validationFailed",
  },
  {
    endpoint: "GET /admin/system/monitoring",
    method: "GET",
    handler: systemMonitoring.GET,
    path: "/admin/system/monitoring",
    status: 200,
  },
  {
    endpoint: "GET /admin/system/usage-stats",
    method: "GET",
    handler: systemUsageStats.GET,
    path: "/admin/system/usage-stats?period=week",
    status: 200,
  },
  {
    endpoint: "GET /admin/system/usage-stats",
    method: "GET",
    handler: systemUsageStats.GET,
    path: "/admin/system/usage-stats?period=year",
    status: 400,
    code: "validationFailed",
  },
];

/** Эндпоинты таблицы spec/000-фронт/03-architecture.md (раскрыты составные строки GET/POST и start/stop/feed). */
const ARCHITECTURE_ENDPOINTS = [
  "POST /auth/login",
  "GET /cards",
  "GET /cards/[id]",
  "POST /cards/[id]/status",
  "POST /cards/[id]/links",
  "POST /cards/[id]/worklines",
  "POST /cards/[id]/reminders",
  "GET /cards/[id]/sms",
  "POST /cards/[id]/sms",
  "GET /cards/[id]/recordings",
  "GET /classifier",
  "GET /reference",
  "GET /scenarios",
  "POST /scenarios",
  "POST /scenarios/[id]/validate",
  "GET /sessions",
  "POST /sessions",
  "POST /sessions/[id]/start",
  "POST /sessions/[id]/stop",
  "GET /sessions/[id]/feed",
  // Эндпоинты волны 3 сверх таблицы 03-architecture.md — строки docs/mock-api.md.
  "GET /sessions/[id]/control",
  "POST /sessions/[id]/control",
  "GET /users",
  "GET /reports",
  "GET /attempts/[id]/evaluation",
  "POST /attempts/[id]/evaluation",
  "GET /reports/journal",
  "POST /reports/feedback",
  "GET /admin/users",
  "POST /admin/users/[id]/toggle-active",
  // Эндпоинты волны 4 сверх таблицы 03-architecture.md — строки docs/mock-api.md.
  "POST /admin/users",
  "PATCH /admin/users/[id]",
  "POST /admin/users/[id]/block",
  "POST /admin/users/[id]/unblock",
  "POST /admin/users/[id]/reset-password",
  "GET /admin/services",
  "GET /admin/settings",
  "GET /admin/audit",
  // Раздел «Система» (фаза 4.2) — строки docs/mock-api.md.
  "GET /admin/system/services",
  "POST /admin/system/services/[id]/action",
  "GET /admin/system/settings",
  "PATCH /admin/system/settings",
  "GET /admin/system/logs",
  "GET /admin/system/monitoring",
  "GET /admin/system/usage-stats",
];

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("контракты эндпоинтов мок-слоя", { shuffle: true }, () => {
  it.each(CASES.map((item) => [`${item.method} ${item.path} → ${item.status}`, item] as const))(
    "%s",
    async (_title, item) => {
      const response = await send(item);
      expect(response.status).toBe(item.status);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body: unknown = await response.json();
      if (item.code === undefined) {
        expect(body).not.toHaveProperty("error");
        return;
      }
      const error = (body as ApiErrorBody).error;
      expect(Object.keys(error).sort()).toEqual(["code", "message"]);
      expect(error.code).toBe(item.code);
      expect(error.message).toMatch(/[А-Яа-яЁё]/);
    },
  );

  it("мутация одного кейса не видна в следующем (resetMockStore)", async () => {
    expect(findStoredUser("u-005")?.isActive).toBe(true);
    const toggle = CASES.find((item) => item.endpoint.includes("toggle-active") && item.status === 200)!;
    await send(toggle);
    expect(findStoredUser("u-005")?.isActive).toBe(false);
    resetMockStore();
    expect(findStoredUser("u-005")?.isActive).toBe(true);
  });
});

describe("полнота: каждая строка таблицы 03-architecture.md", () => {
  it.each(ARCHITECTURE_ENDPOINTS)("%s покрыта кейсом 200/201", (endpoint) => {
    expect(CASES.some((item) => item.endpoint === endpoint && item.status < 300)).toBe(true);
  });

  it("в таблице кейсов нет эндпоинтов вне списка", () => {
    expect(new Set(CASES.map((item) => item.endpoint))).toEqual(new Set(ARCHITECTURE_ENDPOINTS));
  });
});
