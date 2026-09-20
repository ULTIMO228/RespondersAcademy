export { findCardFixture, getCardCaption } from "./lib/cardLookup";
export type { CardCaption } from "./lib/cardLookup";
export { describeEtalonAction, getCardEtalonSegment, parseEtalonAction } from "./lib/etalonActions";
export type { EtalonActionDictionary } from "./lib/etalonActions";
export { formatDeviationSec, getAverage, getElapsedSec, msToSec } from "./lib/metrics";
export { getCardSourceTitle, getModeTitle, getSessionStateTitle } from "./lib/titles";
export { conjugatePast, getLastName, isFemaleName } from "./lib/people";
export { TRAINING_CARD_FIXTURE_IDS } from "./config/cardFixtures";
export { PROCESSING_NORM_SEC, REACTION_NORM_SEC } from "./config/norms";
export { PROFILE_CATEGORIES } from "./config/profileCategories";
export {
  CARD_SOURCE_TITLES,
  ENTERED_FIELD_TITLES,
  MODE_TITLES,
  SESSION_STATE_TITLES,
  SEVERITY_TITLES,
  STUDENT_STATE_TITLES,
} from "./config/titles";
export type {
  CardSource,
  ProfileCategoryRow,
  SessionMode,
  SessionState,
  Severity,
  StudentLiveState,
} from "./model/types";
export { DEFAULT_FULL_PROCESSING_MS, DEFAULT_PRIMARY_REACTION_MS, deviationMs } from "./model/timings";
export { fullProcessingMs, isNormExceeded, parseIsoMs, primaryReactionMs } from "./model/timings";
export { resolveTimeNorms } from "./model/timings";
export type { TimeNormsMs } from "./model/timings";
export { buildSessionFeed } from "./model/feed";
export { projectSessionForStudent } from "./model/projection";
export type { SessionFeedWindow } from "./model/feed";
export type { StudentSessionProjection } from "./model/projection";
