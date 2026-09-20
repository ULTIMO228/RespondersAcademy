import type { ReactNode } from "react";

import type { PublicUser, UserRole } from "@/shared/api";

import { ROLE_TITLES } from "../model/roles";

import styles from "./UserRow.module.css";

type UserRowProps = {
  /** Пользователь без пароля — единственная форма, в которой учётные записи покидают мок-слой. */
  user: PublicUser;
  /** Слот действий строки (кнопки задаёт страница). */
  actions?: ReactNode;
};

const EMPTY_CELL = "—";

/** Строка реестра пользователей: только поля спеки (минимальные привилегии, ТЗ §8). */
export function UserRow({ user, actions }: UserRowProps) {
  const stateKey = user.isActive ? "active" : "blocked";
  // В JSON-моке роль — строка; значения ограничены тремя ролями (валидатор моков).
  const role = user.role as UserRole;
  return (
    <tr className={user.isActive ? undefined : styles["row--blocked"]} data-user-id={user.id}>
      <td className={styles.row__name}>{user.fullName}</td>
      <td className={styles.row__login}>{user.login}</td>
      <td>
        <span className={[styles.role, styles[`role--${role}`]].join(" ")}>{ROLE_TITLES[role]}</span>
      </td>
      <td className={styles.row__arm}>{user.armNumber}</td>
      <td>{user.group ?? EMPTY_CELL}</td>
      <td>{user.service ?? EMPTY_CELL}</td>
      <td>
        <span className={styles.state} data-state={stateKey}>
          <span
            className={[styles.state__dot, styles[`state__dot--${stateKey}`]].join(" ")}
            aria-hidden="true"
          />
          {user.isActive ? "активна" : "заблокирована"}
        </span>
      </td>
      <td className={styles.row__actions}>{actions}</td>
    </tr>
  );
}
