import { PasswordChangeForm } from "@/features/password-change";
import { Card, PageHeader } from "@/shared/ui/platform";

import { AccountNav } from "./AccountNav";
import styles from "./Account.module.css";
import { LogoutAllCard } from "./LogoutAllCard";

/** `/account/security` — смена пароля и завершение всех сессий. 2FA и принудительная смена пароля вне объёма (A14). */
export function AccountSecurityPage() {
  return (
    <>
      <PageHeader title="Безопасность" description="Пароль и активные входы" />
      <AccountNav active="security" />
      <div className={styles.grid}>
        <Card title="Смена пароля">
          <PasswordChangeForm />
        </Card>
        <LogoutAllCard />
      </div>
    </>
  );
}
