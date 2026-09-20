/*
 * ТОЛЬКО ДЛЯ ТЕСТОВ: fetch → настоящие route handlers мок-API (app/api/mock/**) без HTTP-сервера.
 * Позволяет проверять экран карточки на реальных данных и store мок-слоя (RTL-эквивалент e2e).
 */
import { GET as evaluationRoute } from "../../../../app/api/mock/attempts/[id]/evaluation/route";
import { POST as progressRoute } from "../../../../app/api/mock/attempts/[id]/progress/route";
import { POST as attemptRoute } from "../../../../app/api/mock/cards/[id]/attempt/route";
import { POST as linksRoute } from "../../../../app/api/mock/cards/[id]/links/route";
import { GET as recordingsRoute } from "../../../../app/api/mock/cards/[id]/recordings/route";
import { GET as cardRoute } from "../../../../app/api/mock/cards/[id]/route";
import { GET as smsListRoute, POST as smsSendRoute } from "../../../../app/api/mock/cards/[id]/sms/route";
import { POST as statusRoute } from "../../../../app/api/mock/cards/[id]/status/route";
import { POST as workLineRoute } from "../../../../app/api/mock/cards/[id]/worklines/route";
import { GET as classifierRoute } from "../../../../app/api/mock/classifier/route";
import { GET as referenceRoute } from "../../../../app/api/mock/reference/route";
import { GET as scenariosRoute } from "../../../../app/api/mock/scenarios/route";
import { GET as sessionsRoute } from "../../../../app/api/mock/sessions/route";

type RouteHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Route = { method: "GET" | "POST"; pattern: RegExp; handler: RouteHandler };

const route = (method: Route["method"], pattern: RegExp, handler: unknown): Route => ({
  method,
  pattern,
  handler: handler as RouteHandler,
});

const ROUTES: Route[] = [
  route("GET", /^\/reference$/, referenceRoute),
  route("GET", /^\/classifier$/, classifierRoute),
  route("GET", /^\/scenarios$/, scenariosRoute),
  route("GET", /^\/sessions$/, sessionsRoute),
  route("GET", /^\/attempts\/([^/]+)\/evaluation$/, evaluationRoute),
  route("POST", /^\/attempts\/([^/]+)\/progress$/, progressRoute),
  route("POST", /^\/cards\/([^/]+)\/attempt$/, attemptRoute),
  route("POST", /^\/cards\/([^/]+)\/status$/, statusRoute),
  route("POST", /^\/cards\/([^/]+)\/links$/, linksRoute),
  route("POST", /^\/cards\/([^/]+)\/worklines$/, workLineRoute),
  route("GET", /^\/cards\/([^/]+)\/sms$/, smsListRoute),
  route("POST", /^\/cards\/([^/]+)\/sms$/, smsSendRoute),
  route("GET", /^\/cards\/([^/]+)\/recordings$/, recordingsRoute),
  route("GET", /^\/cards\/([^/]+)$/, cardRoute),
];

export type MockApiFetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  calls: string[];
  /** Эмуляция сбоя сети: запросы падают с TypeError, как fetch без связи. */
  setOffline: (isOffline: boolean) => void;
};

/** Диспетчер fetch → route handler; signal не передаётся (jsdom AbortSignal ≠ undici). */
export function createMockApiFetch(): MockApiFetch {
  let isOffline = false;
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace(/^\/api\/mock/, "");
    const method = (init?.method ?? "GET") as Route["method"];
    calls.push(`${method} ${path}${url.search}`);
    if (isOffline) throw new TypeError("Failed to fetch");
    const found = ROUTES.find((candidate) => candidate.method === method && candidate.pattern.test(path));
    if (!found)
      return new Response(JSON.stringify({ error: { code: "notFound", message: path } }), { status: 404 });
    const id = decodeURIComponent(found.pattern.exec(path)?.[1] ?? "");
    const headers = new Headers(init?.headers);
    if (typeof document !== "undefined") headers.set("cookie", document.cookie);
    const request = new Request(url, { method, headers, body: init?.body });
    return found.handler(request, { params: Promise.resolve({ id }) });
  };
  return Object.assign(fetcher, { calls, setOffline: (value: boolean) => (isOffline = value) });
}
