"use client";

import { useState } from "react";

import { ROLE_ORDER, ROLE_TITLES } from "@/entities/user";
import type { PublicUser } from "@/shared/api";
import { Panel } from "@/shared/ui";

import type { AdminUsersApi } from "../api/adminUsersApi";
import type { UsersFilters as UsersFiltersState } from "../model/filters";
import type { RoleOption } from "../model/types";
import { collectGroups, useAdminUsers } from "../model/useAdminUsers";
import { RoleChangeDialog } from "./RoleChangeDialog";
import { UserCreateModal } from "./UserCreateModal";
import { UserEditModal } from "./UserEditModal";
import { UserRowActions } from "./UserRowActions";
import { UsersFilters } from "./UsersFilters";
import { UsersTable } from "./UsersTable";

import styles from "./UsersTable.module.css";

type UsersRegistryProps = {
  /** Администратор сессии — автор мутаций (аудит). */
  adminId: string;
  /** Подмена клиента данных (тесты). */
  api?: AdminUsersApi;
};

type OpenDialog = { kind: "create" } | { kind: "edit" | "role"; user: PublicUser } | null;

const ROLE_OPTIONS: RoleOption[] = ROLE_ORDER.map((role) => ({ value: role, label: ROLE_TITLES[role] }));

/** Реестр учётных записей на живых данных мок-слоя: фильтры, таблица, действия строки и модалки. */
export function UsersRegistry({ adminId, api }: UsersRegistryProps) {
  const page = useAdminUsers({ adminId, api });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const data = page.state.status === "ready" ? page.state.data : null;
  const users: PublicUser[] = data?.users ?? [];
  const allUsers: PublicUser[] = data?.allUsers ?? [];
  const groups = collectGroups(allUsers);
  const changeFilters = (patch: Partial<UsersFiltersState>) =>
    page.setFilters((current) => ({ ...current, ...patch }));

  const emptyText =
    page.state.status === "loading"
      ? "Загрузка реестра…"
      : page.state.status === "error"
        ? page.state.message
        : undefined;

  return (
    <Panel title={`Учётные записи (${allUsers.length})`} headerTone="dark">
      <section className={styles.registry} aria-label="Реестр пользователей">
        <UsersFilters
          filters={page.filters}
          roleOptions={ROLE_OPTIONS}
          groups={groups}
          shownCount={users.length}
          totalCount={allUsers.length}
          onChange={changeFilters}
          onCreate={() => setDialog({ kind: "create" })}
        />
        {page.state.status === "error" ? (
          <p className={styles.registry__error} role="alert">
            {page.state.message}
          </p>
        ) : null}
        <UsersTable
          users={users}
          emptyText={emptyText}
          renderActions={(user) => (
            <UserRowActions
              user={user}
              onEdit={() => setDialog({ kind: "edit", user })}
              onChangeRole={() => setDialog({ kind: "role", user })}
              onSetActive={(isActive) => page.setUserActive(user.id, isActive)}
              onResetPassword={() => page.resetPassword(user.id)}
            />
          )}
        />
      </section>
      {dialog?.kind === "create" ? (
        <UserCreateModal
          roleOptions={ROLE_OPTIONS}
          groups={groups}
          existingLogins={allUsers.map((user) => user.login.toLowerCase())}
          onSubmit={page.createUser}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <UserEditModal
          user={dialog.user}
          roleOptions={ROLE_OPTIONS}
          groups={groups}
          existingLogins={allUsers
            .filter((user) => user.id !== dialog.user.id)
            .map((user) => user.login.toLowerCase())}
          onSubmit={(values) => page.updateUser(dialog.user.id, values)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "role" ? (
        <RoleChangeDialog
          user={dialog.user}
          roleOptions={ROLE_OPTIONS}
          groups={groups}
          onConfirm={(role, roleFields) => page.changeRole(dialog.user.id, role, roleFields)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Panel>
  );
}
