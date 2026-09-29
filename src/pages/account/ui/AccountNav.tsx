import { ROUTES } from "@/shared/config";
import { LinkButton } from "@/shared/ui/platform";

import styles from "./Account.module.css";

/** Переключатель разделов профиля: «Профиль» и «Безопасность». */
export function AccountNav({ active }: { active: "profile" | "security" }) {
  return (
    <nav className={styles.nav} aria-label="Разделы профиля">
      <LinkButton
        href={ROUTES.account}
        variant={active === "profile" ? "primary" : "secondary"}
        aria-current={active === "profile" ? "page" : undefined}
      >
        Профиль
      </LinkButton>
      <LinkButton
        href={ROUTES.accountSecurity}
        variant={active === "security" ? "primary" : "secondary"}
        aria-current={active === "security" ? "page" : undefined}
      >
        Безопасность
      </LinkButton>
    </nav>
  );
}
