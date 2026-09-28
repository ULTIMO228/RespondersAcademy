"use client";

import type { ReactNode } from "react";

import { UserRow } from "@/entities/user";
import type { PublicUser } from "@/shared/api";

import { USER_TABLE_COLUMNS } from "../config/usersTable";

import styles from "./UsersTable.module.css";

type UsersTableProps = {
  users: PublicUser[];
  /** Слот действий строки (реестр задаёт свои обработчики). */
  renderActions: (user: PublicUser) => ReactNode;
  /** Текст пустого состояния: загрузка / «не найдены» / ошибка. */
  emptyText?: string;
};

const EMPTY_TEXT = "Пользователи не найдены";

/**
 * Таблица реестра (T4.1-05): ФИО, логин, роль-бейдж, № АРМ, группа, служба, состояние, действия.
 * Колонка «создана» не выводится — поле `User.createdAt` удалено из модели (05-data-models.md,
 * приложение волны B); зафиксированное расхождение №4 spec/000-фронт/12-tasks.md.
 */
export function UsersTable({ users, renderActions, emptyText = EMPTY_TEXT }: UsersTableProps) {
  return (
    <table className={styles.registry__table}>
      <caption className="visually-hidden">Пользователи тренажёра</caption>
      <thead>
        <tr>
          {USER_TABLE_COLUMNS.map((column) => (
            <th key={column.key} scope="col">
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow key={user.id} user={user} actions={renderActions(user)} />
        ))}
        {users.length === 0 ? (
          <tr>
            <td className={styles.registry__empty} colSpan={USER_TABLE_COLUMNS.length}>
              {emptyText}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
