import { getSessionUser } from "@/entities/user/index.server";

import { RolesMatrixInfo } from "./RolesMatrixInfo";
import { UsersRegistry } from "./UsersRegistry";

import styles from "./AdminUsersPage.module.css";

/**
 * `/admin/users` — «Пользователи и роли» (spec/04-pages/20-admin-users.md).
 * Серверный компонент: администратор — пользователь сессии (гвард — proxy + лэйаут раздела);
 * реестр и мутации экран берёт из мок-API через `@/shared/api`.
 */
export async function AdminUsersPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <div className={styles.page}>
      <header className={styles.page__header}>
        <h1 className={styles.page__title}>Пользователи и роли</h1>
        <p className={styles.page__note}>
          Администратор не имеет доступа к оценкам и сценариям. В реестре — только необходимые поля (принцип
          минимальных привилегий, ТЗ §8).
        </p>
      </header>
      <UsersRegistry adminId={sessionUser.user.id} />
      <RolesMatrixInfo />
    </div>
  );
}
