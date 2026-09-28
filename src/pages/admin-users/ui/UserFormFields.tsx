"use client";

import { Input, Select } from "@/shared/ui";
import type { Role } from "@/shared/api";

import type { RoleOption } from "../model/types";
import type { UserFormErrors, UserFormValues } from "../model/user-form";

import styles from "./UserFormFields.module.css";

type UserFormFieldsProps = {
  values: UserFormValues;
  errors: UserFormErrors;
  groups: string[];
  roleOptions: RoleOption[];
  /** Создание: поле роли и временный пароль; редактирование: роль меняется отдельным действием. */
  mode: "create" | "edit";
  onChange: (patch: Partial<UserFormValues>) => void;
};

/**
 * Поля учётной записи (spec/000-фронт/04-pages/20-admin-users.md): общие для создания и редактирования.
 * № АРМ обязателен для всех ролей — в реальном АРМ-112 вход выполняется с номером АРМ (02-roles.md).
 */
export function UserFormFields({ values, errors, groups, roleOptions, mode, onChange }: UserFormFieldsProps) {
  const groupOptions = groups.map((group) => ({ value: group, label: group }));
  const toggleAssigned = (group: string) =>
    onChange({
      assignedGroups: values.assignedGroups.includes(group)
        ? values.assignedGroups.filter((entry) => entry !== group)
        : [...values.assignedGroups, group],
    });

  return (
    <div className={styles.form}>
      <Input
        label="ФИО"
        placeholder="Фамилия Имя Отчество"
        className={styles.form__wide}
        value={values.fullName}
        error={errors.fullName}
        onChange={(event) => onChange({ fullName: event.target.value })}
      />
      <Input
        label="Логин"
        placeholder="латиница, без пробелов"
        value={values.login}
        hint="Логин проверяется на уникальность"
        error={errors.login}
        onChange={(event) => onChange({ login: event.target.value })}
      />
      {mode === "create" ? (
        <Input
          label="Временный пароль"
          type="password"
          hint="Смена при первом входе"
          value={values.password}
          error={errors.password}
          onChange={(event) => onChange({ password: event.target.value })}
        />
      ) : null}
      {mode === "create" ? (
        <Select
          label="Роль"
          tone="boxed"
          options={roleOptions}
          value={values.role}
          onChange={(event) => onChange({ role: event.target.value as Role })}
        />
      ) : null}
      <Input
        label="Номер АРМ"
        type="number"
        min={1}
        hint="Как в реальном АРМ-112: вход выполняется с номером АРМ"
        value={values.armNumber}
        error={errors.armNumber}
        onChange={(event) => onChange({ armNumber: event.target.value })}
      />
      {values.role === "student" ? (
        <Select
          label="Группа"
          tone="boxed"
          options={groupOptions}
          placeholder="выберите группу"
          value={values.group}
          onChange={(event) => onChange({ group: event.target.value })}
        />
      ) : null}
      {values.role !== "admin" ? (
        <Input
          label="Служба"
          placeholder="ДДС района / профильная служба"
          value={values.service}
          onChange={(event) => onChange({ service: event.target.value })}
        />
      ) : null}
      {values.role === "teacher" ? (
        <fieldset className={styles.form__groups}>
          {/* [app-расширение модели] закреплённые группы преподавателя — расхождение №4→№5 спек. */}
          <legend className={styles.form__legend}>Закреплённые группы</legend>
          {groups.map((group) => (
            <label key={group} className={styles.form__check}>
              <input
                type="checkbox"
                checked={values.assignedGroups.includes(group)}
                onChange={() => toggleAssigned(group)}
              />{" "}
              {group}
            </label>
          ))}
          {errors.assignedGroups ? <span className={styles.form__error}>{errors.assignedGroups}</span> : null}
        </fieldset>
      ) : null}
      {errors.group ? <span className={styles.form__error}>{errors.group}</span> : null}
    </div>
  );
}
