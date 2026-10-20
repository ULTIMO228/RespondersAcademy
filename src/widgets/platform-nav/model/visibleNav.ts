import type { TrainingProfile, UserRole } from "@/shared/api";
import { allowsMode } from "@/shared/config";

import { PLATFORM_NAV } from "../config/navItems";
import type { PlatformNavEntry } from "../config/navItems";

/** Пункты боковой панели роли без разделов чужого режима (spec/008, T041: специалисту-112 — без «Открыть АРМ»). */
export function visibleNavEntries(user: {
  role: UserRole;
  trainingProfile?: TrainingProfile;
}): PlatformNavEntry[] {
  return PLATFORM_NAV[user.role].filter(
    (entry) => !entry.requiresMode || allowsMode(user, entry.requiresMode),
  );
}
