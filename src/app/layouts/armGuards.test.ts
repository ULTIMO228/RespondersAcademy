/*
 * Гварды зон симулятора (спека 007): какой лэйаут какую специализацию требует. Сам гвард
 * (`requireSpecialization`) проверен в src/entities/user/model/server-session.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSpecialization = vi.fn();

vi.mock("@/entities/user/index.server", () => ({
  requireSpecialization: (mode: string) => requireSpecialization(mode),
}));

import { ArmCardLayout } from "./ArmCardLayout";
import { ArmJournalLayout } from "./ArmJournalLayout";
import { ArmOperator112Layout, ArmPhoneLayout, ArmSectionLayout } from "./ArmSectionLayout";
import { GuardedThemeLayout } from "./GuardedThemeLayout";

const SESSION = {
  user: {
    id: "u-005",
    login: "ivanov",
    fullName: "Иванов Сергей",
    role: "student",
    armNumber: 1,
    isActive: true,
  },
};

beforeEach(() => {
  requireSpecialization.mockReset();
  requireSpecialization.mockResolvedValue(SESSION);
});

function zoneOf(element: unknown): unknown {
  return (element as { props: { zone: unknown } }).props.zone;
}

describe("зона, которую требует каждый лэйаут /arm/*", () => {
  it("/arm/operator112 — зона 112", () => {
    expect(zoneOf(ArmOperator112Layout({ children: null }))).toBe("operator112");
  });

  it("/arm/phone — софтфон ДДС: зона ДДС, а не 112", () => {
    expect(zoneOf(ArmPhoneLayout({ children: null }))).toBe("dds");
  });

  it("журнал /arm — зона ДДС", () => {
    expect(zoneOf(ArmJournalLayout({ children: null }))).toBe("dds");
  });

  it("карточка /arm/card/[id] — зона ДДС", () => {
    expect(zoneOf(ArmCardLayout({ children: null }))).toBe("dds");
  });
});

describe("исполнение гварда лэйаутами", () => {
  it("общий лэйаут раздела вызывает requireSpecialization с зоной", async () => {
    await ArmSectionLayout({ zone: "operator112", children: null });
    expect(requireSpecialization).toHaveBeenCalledExactlyOnceWith("operator112");
  });

  it("лэйаут экрана без шапки вызывает requireSpecialization с зоной", async () => {
    await GuardedThemeLayout({ zone: "dds", theme: "dark", children: null });
    expect(requireSpecialization).toHaveBeenCalledExactlyOnceWith("dds");
  });

  it("отказ гварда (redirect на /forbidden) не проглатывается", async () => {
    requireSpecialization.mockRejectedValue(new Error("NEXT_REDIRECT:/forbidden"));
    await expect(ArmSectionLayout({ zone: "operator112", children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/forbidden",
    );
    await expect(GuardedThemeLayout({ zone: "dds", theme: "light", children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/forbidden",
    );
  });
});
