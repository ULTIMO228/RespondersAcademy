"use client";

import { ROLE_TITLES, useSessionUser } from "@/entities/user";
import { Card, EmptyState, PageHeader } from "@/shared/ui/platform";

import { AccountNav } from "./AccountNav";
import styles from "./Account.module.css";

/** `/account` — данные пользователя из подтверждённой сервером сессии (только чтение). */
export function AccountProfilePage() {
  const user = useSessionUser();
  return (
    <>
      <PageHeader title="Профиль" description="Учётная запись и доступ" />
      <AccountNav active="profile" />
      {user ? (
        <Card title="Учётная запись">
          <dl className={styles.facts}>
            <dt>ФИО</dt>
            <dd>{user.fullName}</dd>
            <dt>Логин</dt>
            <dd>{user.login}</dd>
            <dt>Роль</dt>
            <dd>{ROLE_TITLES[user.role]}</dd>
            {user.group ? (
              <>
                <dt>Группа</dt>
                <dd>{user.group}</dd>
              </>
            ) : null}
            {user.service ? (
              <>
                <dt>Служба</dt>
                <dd>{user.service}</dd>
              </>
            ) : null}
            {user.assignedGroups && user.assignedGroups.length > 0 ? (
              <>
                <dt>Закреплённые группы</dt>
                <dd>{user.assignedGroups.join(", ")}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Профиль недоступен" text="Войдите в систему заново." />
        </Card>
      )}
    </>
  );
}
