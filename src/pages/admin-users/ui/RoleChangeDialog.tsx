"use client";

import { useState } from "react";

import type { AdminUserFailure, AdminUserRoleFields, PublicUser, Role } from "@/shared/api";
import { Button, Modal, Select } from "@/shared/ui";

import type { RoleOption } from "../model/types";

import styles from "./UserRowActions.module.css";

type RoleChangeDialogProps = {
  user: PublicUser;
  roleOptions: RoleOption[];
  groups: string[];
  onConfirm: (role: Role, roleFields: AdminUserRoleFields) => Promise<AdminUserFailure | null>;
  onClose: () => void;
};

const DIALOG_WIDTH = 480;

/**
 * «Назначить/сменить роль» (T4.1-08) — отдельное действие с подтверждением: пишет AuditLogEntry
 * `user.roleChange`. Ролевые поля новой роли (группа / закреплённые группы) задаются здесь же,
 * лишние для новой роли — отбрасываются мок-слоем.
 */
export function RoleChangeDialog({ user, roleOptions, groups, onConfirm, onClose }: RoleChangeDialogProps) {
  const [role, setRole] = useState<Role>(user.role);
  const [group, setGroup] = useState(user.group ?? "");
  const [assignedGroups, setAssignedGroups] = useState<string[]>(user.assignedGroups ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setPending] = useState(false);
  const isSameRole = role === user.role;

  const toggleAssigned = (value: string) =>
    setAssignedGroups((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );

  async function confirm() {
    setPending(true);
    const failure = await onConfirm(role, { group: group || undefined, assignedGroups });
    setPending(false);
    if (failure) setError(failure.message);
    else onClose();
  }

  return (
    <Modal
      title="Смена роли"
      onClose={onClose}
      width={DIALOG_WIDTH}
      footer={
        <div className={styles.dialog__footer}>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={confirm} disabled={isSameRole || isPending}>
            Сменить роль
          </Button>
        </div>
      }
    >
      <p className={styles.dialog__text}>{user.fullName}</p>
      <Select
        label="Роль"
        tone="boxed"
        options={roleOptions}
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
      />
      {role === "student" ? (
        <Select
          label="Группа"
          tone="boxed"
          options={groups.map((entry) => ({ value: entry, label: entry }))}
          placeholder="выберите группу"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        />
      ) : null}
      {role === "teacher" ? (
        <fieldset className={styles.dialog__groups}>
          <legend className={styles.dialog__legend}>Закреплённые группы</legend>
          {groups.map((entry) => (
            <label key={entry} className={styles.dialog__check}>
              <input
                type="checkbox"
                checked={assignedGroups.includes(entry)}
                onChange={() => toggleAssigned(entry)}
              />{" "}
              {entry}
            </label>
          ))}
        </fieldset>
      ) : null}
      {isSameRole ? <p className={styles.dialog__hint}>Выберите роль, отличную от текущей.</p> : null}
      {error ? (
        <p className={styles.dialog__error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.dialog__audit}>Смена роли записывается в журнал аудита.</p>
    </Modal>
  );
}
