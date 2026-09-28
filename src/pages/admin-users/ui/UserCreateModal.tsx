"use client";

import { useState } from "react";

import type { AdminUserFailure } from "@/shared/api";
import { Button, Modal } from "@/shared/ui";

import type { RoleOption } from "../model/types";
import { EMPTY_USER_FORM, hasFormErrors, validateUserForm } from "../model/user-form";
import type { UserFormErrors, UserFormValues } from "../model/user-form";
import { UserFormFields } from "./UserFormFields";

import styles from "./UserFormFields.module.css";

type UserCreateModalProps = {
  roleOptions: RoleOption[];
  groups: string[];
  /** Логины реестра в нижнем регистре — проверка уникальности до запроса. */
  existingLogins: string[];
  onSubmit: (values: UserFormValues) => Promise<AdminUserFailure | null>;
  onClose: () => void;
};

const MODAL_WIDTH = 560;

/** «Создание учётной записи» (spec/000-фронт/04-pages/20-admin-users.md): состав полей зависит от роли. */
export function UserCreateModal({
  roleOptions,
  groups,
  existingLogins,
  onSubmit,
  onClose,
}: UserCreateModalProps) {
  const [values, setValues] = useState<UserFormValues>(EMPTY_USER_FORM);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setPending] = useState(false);

  const change = (patch: Partial<UserFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
    setFormError(null);
  };

  async function submit() {
    const found = validateUserForm(values, { mode: "create", takenLogins: existingLogins });
    setErrors(found);
    if (hasFormErrors(found)) return;
    setPending(true);
    const failure = await onSubmit(values);
    setPending(false);
    if (!failure) {
      onClose();
      return;
    }
    // 409 от мок-слоя — ошибка поля «Логин», прочее — сообщение над кнопками.
    if (failure.field === "login") setErrors({ login: failure.message });
    else setFormError(failure.message);
  }

  return (
    <Modal
      title="Создание учётной записи"
      onClose={onClose}
      width={MODAL_WIDTH}
      footer={
        <>
          {formError ? (
            <span className={styles.form__error} role="alert">
              {formError}
            </span>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="lg" onClick={submit} disabled={isPending}>
            Создать
          </Button>
        </>
      }
    >
      <UserFormFields
        values={values}
        errors={errors}
        groups={groups}
        roleOptions={roleOptions}
        mode="create"
        onChange={change}
      />
    </Modal>
  );
}
