"use client";

import { useState } from "react";

import type { AdminUserFailure, PublicUser } from "@/shared/api";
import { Button, Modal } from "@/shared/ui";

import { AUDIT_NOTE } from "../config/usersTable";

import styles from "./UserRowActions.module.css";

type UserRowActionsProps = {
  user: PublicUser;
  onEdit: () => void;
  onChangeRole: () => void;
  onSetActive: (isActive: boolean) => Promise<AdminUserFailure | null>;
  onResetPassword: () => Promise<{ temporaryPassword: string } | AdminUserFailure>;
};

type ActionDialog = "block" | "password" | null;

const DIALOG_WIDTH = 480;

/**
 * Действия строки реестра (T4.1-09): изменить, сменить роль, сбросить пароль, заблокировать/разблокировать.
 * Блокировка и сброс пароля — с подтверждением; оба действия пишутся в журнал аудита.
 */
export function UserRowActions({
  user,
  onEdit,
  onChangeRole,
  onSetActive,
  onResetPassword,
}: UserRowActionsProps) {
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const blockLabel = user.isActive ? "Заблокировать" : "Разблокировать";

  function closeDialog() {
    setDialog(null);
    setError(null);
    setTemporaryPassword(null);
  }

  async function confirmBlock() {
    setPending(true);
    const failure = await onSetActive(!user.isActive);
    setPending(false);
    if (failure) setError(failure.message);
    else closeDialog();
  }

  async function confirmReset() {
    setPending(true);
    const result = await onResetPassword();
    setPending(false);
    if ("temporaryPassword" in result) setTemporaryPassword(result.temporaryPassword);
    else setError(result.message);
  }

  return (
    <div className={styles.actions}>
      <Button size="sm" variant="ghost" title="Редактировать учётную запись" onClick={onEdit}>
        Изменить
      </Button>
      <Button size="sm" variant="ghost" title={`Сменить роль (${AUDIT_NOTE})`} onClick={onChangeRole}>
        Роль
      </Button>
      <Button size="sm" variant="ghost" title="Сбросить пароль" onClick={() => setDialog("password")}>
        Сброс пароля
      </Button>
      <Button
        size="sm"
        variant={user.isActive ? "danger" : "blue"}
        title={`${blockLabel} (${AUDIT_NOTE})`}
        onClick={() => setDialog("block")}
      >
        {blockLabel}
      </Button>
      {dialog === "block" ? (
        <Modal
          title={`${blockLabel}?`}
          onClose={closeDialog}
          width={DIALOG_WIDTH}
          footer={
            <div className={styles.dialog__footer}>
              <Button variant="ghost" onClick={closeDialog}>
                Отмена
              </Button>
              <Button
                variant={user.isActive ? "danger" : "primary"}
                onClick={confirmBlock}
                disabled={isPending}
              >
                {blockLabel}
              </Button>
            </div>
          }
        >
          <p className={styles.dialog__text}>
            {user.isActive
              ? `Учётная запись «${user.fullName}» будет заблокирована: вход в систему запрещён.`
              : `Учётная запись «${user.fullName}» будет разблокирована.`}
          </p>
          {error ? (
            <p className={styles.dialog__error} role="alert">
              {error}
            </p>
          ) : null}
          <p className={styles.dialog__audit}>Блокировка и разблокировка записываются в журнал аудита.</p>
        </Modal>
      ) : null}
      {dialog === "password" ? (
        <Modal
          title="Сброс пароля"
          onClose={closeDialog}
          width={DIALOG_WIDTH}
          footer={
            <div className={styles.dialog__footer}>
              <Button variant="ghost" onClick={closeDialog}>
                {temporaryPassword ? "Закрыть" : "Отмена"}
              </Button>
              {temporaryPassword ? null : (
                <Button variant="primary" onClick={confirmReset} disabled={isPending}>
                  Сбросить
                </Button>
              )}
            </div>
          }
        >
          {temporaryPassword ? (
            <>
              <p className={styles.dialog__text}>
                Временный пароль для «{user.fullName}» — сообщите его пользователю; смена при следующем входе.
              </p>
              <p className={styles.dialog__password}>{temporaryPassword}</p>
            </>
          ) : (
            <p className={styles.dialog__text}>
              Для «{user.fullName}» будет сгенерирован временный пароль; смена — при следующем входе.
            </p>
          )}
          {error ? (
            <p className={styles.dialog__error} role="alert">
              {error}
            </p>
          ) : null}
          <p className={styles.dialog__audit}>Сброс пароля записывается в журнал аудита.</p>
        </Modal>
      ) : null}
    </div>
  );
}
