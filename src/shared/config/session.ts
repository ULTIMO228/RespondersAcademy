/* Cookie сессии: имя и срок — общие для proxy, серверных модулей и мок-слоя (значение — только JWT, ставит сервер). */
export const SESSION_COOKIE = "arm112_session";

const SECONDS_PER_HOUR = 3600;
const SESSION_TTL_HOURS = 24;

/** Срок сессии, секунды: 24 ч, как `JWT_TTL_HOURS` бэкенда (автовыход в реальном АРМ-112 — 24 ч). */
export const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * SECONDS_PER_HOUR;
