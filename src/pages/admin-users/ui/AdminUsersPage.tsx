import { getSessionUser } from "@/entities/user/index.server";
import { PageHeader } from "@/shared/ui/platform";

import { RolesMatrixInfo } from "./RolesMatrixInfo";
import { UsersRegistry } from "./UsersRegistry";

import styles from "./AdminUsersPage.module.css";

/**
 * `/admin/users` — «Пользователи и роли» (spec/000-фронт/04-pages/20-admin-users.md).
 * Серверный компонент: администратор — пользователь сессии (гвард — proxy + лэйаут раздела);
 * реестр и мутации экран берёт из мок-API через `@/shared/api`.
 */
export async function AdminUsersPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <div className={styles.page}>
      <PageHeader
        title="Пользователи и роли"
        description="Администратор не имеет доступа к оценкам и сценариям. В реестре — только необходимые поля (принцип минимальных привилегий, ТЗ §8)."
      />
      <UsersRegistry adminId={sessionUser.user.id} />
      <RolesMatrixInfo />
    </div>
  );
}
