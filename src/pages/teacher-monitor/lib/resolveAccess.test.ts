/* T3.3-09: монитор открыт только в рамках своего идущего занятия и только его курсантам. */
import { describe, expect, it } from "vitest";

import type { LiveSessionState } from "@/widgets/monitor-grid";
import type { SessionContract } from "@/shared/api";

import { ACCESS_MESSAGES, resolveAccess } from "./resolveAccess";

const ready = (studentIds: string[]): LiveSessionState => ({
  status: "ready",
  live: {
    session: { studentIds } as unknown as SessionContract,
    isIssuePaused: false,
    norms: { primaryReactionMs: 30_000, fullProcessingMs: 180_000 },
  },
});

describe("resolveAccess", () => {
  it("курсант своего идущего занятия — доступ", () => {
    expect(resolveAccess(ready(["u-005", "u-006"]), "u-005")).toBe("granted");
  });

  it("чужой курсант — отказ с пояснением", () => {
    expect(resolveAccess(ready(["u-005"]), "u-015")).toBe("foreignStudent");
    expect(ACCESS_MESSAGES.foreignStudent).toMatch(/не участвует в вашем занятии/);
  });

  it("вне активного занятия и при ошибке — отказ", () => {
    expect(resolveAccess({ status: "empty" }, "u-005")).toBe("noSession");
    expect(resolveAccess({ status: "error", message: "нет связи" }, "u-005")).toBe("error");
    expect(resolveAccess({ status: "loading" }, "u-005")).toBe("loading");
  });
});
