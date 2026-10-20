/* Серверный public API слайса: только для серверных компонентов, лэйаутов и proxy-логики. */
export { findUser, getDemoUser } from "./model/demoUser";
export {
  getSessionUser,
  requireSessionUser,
  requireSpecialization,
  SessionVerificationError,
  verifySession,
} from "./model/server-session";
export type { SessionUser } from "./model/server-session";
