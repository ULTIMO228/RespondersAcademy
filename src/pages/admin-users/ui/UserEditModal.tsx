"use client";

import { useState } from "react";

import type { AdminUserFailure, PublicUser } from "@/shared/api";
import { Button, Modal } from "@/shared/ui";

import type { RoleOption } from "../model/types";
import { hasFormErrors, toFormValues, validateUserForm } from "../model/user-form";
import type { UserFormErrors, UserFormValues } from "../model/user-form";
import { UserFormFields } from "./UserFormFields";

import styles from "./UserFormFields.module.css";

type UserEditModalProps = {
  user: PublicUser;
  roleOptions: RoleOption[];
  groups: string[];
  /** Логины остальных учётных записей (свой логин конфликтом не считается). */
  existingLogins: string[];
  onSubmit: (values: UserFormValues) => Promise<AdminUserFailure | null>;
  onClose: () => void;
};

const MODAL_WIDTH = 560;

/**
 * «Изменить учётную запись» (T4.1-08). Роль здесь не меняется: назначение/смена роли — отдельное
 * действие строки с подтверждением и собственной записью аудита (критерий приёмки 20-admin-users.md).
 */
export function UserEditModal({
  user,
  roleOptions,
  groups,
  existingLogins,
  onSubmit,
  onClose,
}: UserEditModalProps) {
  const [values, setValues] = useState<UserFormValues>(() => toFormValues(user));
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setPending] = useState(false);

  const change = (patch: Partial<UserFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
    setFormError(null);
  };

  async function submit() {
    const found = validateUserForm(values, { mode: "edit", takenLogins: existingLogins });
    setErrors(found);
    if (hasFormErrors(found)) return;
    setPending(true);
    const failure = await onSubmit(values);
    setPending(false);
    if (!failure) {
      onClose();
      return;
    }
    if (failure.field === "login") setErrors({ login: failure.message });
    else setFormError(failure.message);
  }

  return (
    <Modal
      title={`Изменение учётной записи: ${user.fullName}`}
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
            Сохранить
          </Button>
        </>
      }
    >
      <UserFormFields
        values={values}
        errors={errors}
        groups={groups}
        roleOptions={roleOptions}
        mode="edit"
        onChange={change}
      />
    </Modal>
  );
}
