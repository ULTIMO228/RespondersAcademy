/* Серверный public API слайса: только для серверных компонентов, лэйаутов и proxy-логики. */
export { findUser, getDemoUser } from "./model/demoUser";
export {
  getSessionUser,
  requireSessionUser,
  SessionVerificationError,
  verifySession,
} from "./model/server-session";
export type { SessionUser } from "./model/server-session";
