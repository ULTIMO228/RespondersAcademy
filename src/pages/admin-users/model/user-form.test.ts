// @vitest-environment node
/* T4.1-07: схема формы учётной записи — happy/edge/error и сборка тела запроса. */
import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/shared/api";

import {
  EMPTY_USER_FORM,
  hasFormErrors,
  toCreateRequest,
  toFormValues,
  toUpdateRequest,
  USER_FORM_MESSAGES,
  validateUserForm,
} from "./user-form";
import type { UserFormValues } from "./user-form";

const ADMIN_ID = "u-001";

const STUDENT: UserFormValues = {
  ...EMPTY_USER_FORM,
  fullName: "Новиков Артём Петрович",
  login: "novikov",
  password: "temp-2026",
  role: "student",
  armNumber: "25",
  group: "ДДС-01",
  service: "ДДС района Зюзино",
};

const TEACHER: UserFormValues = {
  ...STUDENT,
  login: "novikova",
  role: "teacher",
  assignedGroups: ["ДДС-01"],
};

describe("validateUserForm — создание", () => {
  it("корректная форма обучающегося — без ошибок", () => {
    expect(validateUserForm(STUDENT, { mode: "create" })).toEqual({});
    expect(hasFormErrors({})).toBe(false);
  });

  it("пустая форма — ошибки обязательных полей по-русски", () => {
    const errors = validateUserForm(EMPTY_USER_FORM, { mode: "create" });
    expect(errors).toMatchObject({
      fullName: USER_FORM_MESSAGES.fullName,
      login: USER_FORM_MESSAGES.login,
      password: USER_FORM_MESSAGES.password,
      armNumber: USER_FORM_MESSAGES.armNumber,
      group: USER_FORM_MESSAGES.group,
    });
    expect(hasFormErrors(errors)).toBe(true);
  });

  it("логин: кириллица, пробел и ведущая цифра — ошибка формата", () => {
    for (const login of ["новиков", "novi kov", "1novikov", " "]) {
      expect(validateUserForm({ ...STUDENT, login }, { mode: "create" }).login).toBeDefined();
    }
    expect(
      validateUserForm({ ...STUDENT, login: "novikov.a_1-b" }, { mode: "create" }).login,
    ).toBeUndefined();
  });

  it("занятый логин — ошибка поля до запроса (регистр не важен)", () => {
    const errors = validateUserForm(
      { ...STUDENT, login: "Admin" },
      {
        mode: "create",
        takenLogins: ["admin"],
      },
    );
    expect(errors.login).toBe(USER_FORM_MESSAGES.loginTaken);
  });

  it("№ АРМ: 0, дробное и не-число — ошибка; 1 — допустимо", () => {
    for (const armNumber of ["0", "-3", "1.5", "две"]) {
      expect(validateUserForm({ ...STUDENT, armNumber }, { mode: "create" }).armNumber).toBe(
        USER_FORM_MESSAGES.armNumber,
      );
    }
    expect(validateUserForm({ ...STUDENT, armNumber: "1" }, { mode: "create" }).armNumber).toBeUndefined();
  });

  it("преподавателю нужна хотя бы одна закреплённая группа, группа обучающегося не требуется", () => {
    expect(validateUserForm({ ...TEACHER, assignedGroups: [] }, { mode: "create" }).assignedGroups).toBe(
      USER_FORM_MESSAGES.assignedGroups,
    );
    expect(validateUserForm({ ...TEACHER, group: "" }, { mode: "create" }).group).toBeUndefined();
  });

  it("администратору не нужны ни группа, ни закреплённые группы", () => {
    const admin: UserFormValues = { ...STUDENT, role: "admin", group: "", assignedGroups: [] };
    expect(validateUserForm(admin, { mode: "create" })).toEqual({});
  });
});

describe("validateUserForm — редактирование", () => {
  it("временный пароль не требуется", () => {
    expect(validateUserForm({ ...STUDENT, password: "" }, { mode: "edit" })).toEqual({});
  });
});

describe("сборка тела запроса", () => {
  it("toCreateRequest: ролевые поля по роли, № АРМ — число", () => {
    expect(toCreateRequest(STUDENT, ADMIN_ID)).toEqual({
      adminId: ADMIN_ID,
      fullName: "Новиков Артём Петрович",
      login: "novikov",
      password: "temp-2026",
      role: "student",
      armNumber: 25,
      group: "ДДС-01",
      service: "ДДС района Зюзино",
      assignedGroups: undefined,
    });
    expect(toCreateRequest(TEACHER, ADMIN_ID)).toMatchObject({
      role: "teacher",
      group: undefined,
      assignedGroups: ["ДДС-01"],
    });
    expect(toCreateRequest({ ...STUDENT, role: "admin" }, ADMIN_ID)).toMatchObject({
      group: undefined,
      service: undefined,
      assignedGroups: undefined,
    });
  });

  it("toUpdateRequest не содержит роли (смена роли — отдельное действие T4.1-08)", () => {
    expect(toUpdateRequest(STUDENT, ADMIN_ID)).not.toHaveProperty("role");
  });

  it("toFormValues разворачивает пользователя в значения формы", () => {
    const user: PublicUser = {
      id: "u-005",
      login: "ivanov",
      fullName: "Иванов Сергей Петрович",
      role: "student",
      armNumber: 1,
      isActive: true,
      group: "ДДС-01",
      service: "ДДС района Чертаново Южное",
    };
    expect(toFormValues(user)).toEqual({
      fullName: "Иванов Сергей Петрович",
      login: "ivanov",
      password: "",
      role: "student",
      armNumber: "1",
      group: "ДДС-01",
      service: "ДДС района Чертаново Южное",
      assignedGroups: [],
    });
  });
});
