import { describe, expect, it } from "vitest";

import { PASSWORD_MESSAGES, validatePasswordChange } from "./validation";

const VALID = {
  currentPassword: "student112",
  newPassword: "новый-пароль-1",
  confirmPassword: "новый-пароль-1",
};

describe("validatePasswordChange", () => {
  it("корректный ввод — ошибок нет", () => {
    expect(validatePasswordChange(VALID, 8)).toEqual({});
  });

  it("слабый пароль короче политики", () => {
    expect(
      validatePasswordChange({ ...VALID, newPassword: "abc", confirmPassword: "abc" }, 8).newPassword,
    ).toBe(PASSWORD_MESSAGES.tooShort(8));
  });

  it("пустой текущий пароль", () => {
    expect(validatePasswordChange({ ...VALID, currentPassword: "" }, 8).currentPassword).toBe(
      PASSWORD_MESSAGES.currentRequired,
    );
  });

  it("новый совпадает с текущим", () => {
    const same = { currentPassword: "student112", newPassword: "student112", confirmPassword: "student112" };
    expect(validatePasswordChange(same, 8).newPassword).toBe(PASSWORD_MESSAGES.sameAsCurrent);
  });

  it("подтверждение не совпадает", () => {
    expect(validatePasswordChange({ ...VALID, confirmPassword: "другой-пароль" }, 8).confirmPassword).toBe(
      PASSWORD_MESSAGES.mismatch,
    );
  });
});
