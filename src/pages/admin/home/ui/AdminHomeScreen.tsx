"use client";

import Link from "next/link";

import { ROLE_TITLES } from "@/entities/user";
import type { AuditLogEntry, PublicUser, UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { describeAuditAction } from "@/shared/config";
import { formatDate, formatTime } from "@/shared/lib";
import {
  Card,
  DataTable,
  NormChart,
  PageHeader,
  PlatformButton,
  ResourceView,
  StatGroup,
  StatTile,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { adminHomeApi } from "../api/homeApi";
import type { AdminHomeApi } from "../api/homeApi";

import styles from "./AdminHome.module.css";

const DB_TITLES: Record<string, string> = { sqlite: "SQLite (разработка)", postgresql: "PostgreSQL" };
const ROLES: UserRole[] = ["student", "teacher", "admin"];

const last = (values: number[]): number | null => (values.length > 0 ? values[values.length - 1] : null);

export function countActiveByRole(users: PublicUser[]): Record<UserRole, number> {
  const counts: Record<UserRole, number> = { student: 0, teacher: 0, admin: 0 };
  for (const user of users) if (user.isActive) counts[user.role] += 1;
  return counts;
}

type AdminHomeScreenProps = { api?: AdminHomeApi };

/**
 * `/admin` — главная администратора. Каждый блок грузится независимо: сбой или отсутствие сервера в одном
 * (например, `/api/v1/health` без бэкенда) не роняет остальные.
 */
export function AdminHomeScreen({ api = adminHomeApi }: AdminHomeScreenProps) {
  const health = useResource((signal) => api.health(signal), [api]);
  const services = useResource((signal) => api.services(signal), [api]);
  const monitoring = useResource((signal) => api.monitoring(signal), [api]);
  const users = useResource((signal) => api.users(signal), [api]);
  const audit = useResource((signal) => api.audit(signal), [api]);
  const usersList = users.state.status === "ready" ? users.state.data : [];

  const auditColumns: DataColumn<AuditLogEntry>[] = [
    { key: "at", title: "Когда", render: (row) => `${formatDate(row.at)} ${formatTime(row.at)}` },
    {
      key: "user",
      title: "Пользователь",
      render: (row) => usersList.find((user) => user.id === row.userId)?.fullName ?? row.userId ?? "Система",
    },
    { key: "event", title: "Событие", render: (row) => describeAuditAction(row.action) },
  ];

  return (
    <section aria-labelledby="admin-home-title">
      <PageHeader
        title="Состояние системы"
        description="Сервер, сервисы, нагрузка и последние действия пользователей"
        actions={
          <PlatformButton
            variant="secondary"
            onClick={() => {
              health.reload();
              services.reload();
              monitoring.reload();
              users.reload();
              audit.reload();
            }}
          >
            Обновить
          </PlatformButton>
        }
      />
      <div className={styles.grid}>
        <Card title="Сервер тренажёра" aria-label="Сервер тренажёра">
          <ResourceView state={health.state} onRetry={health.reload} skeletonLines={2}>
            {(data) => (
              <dl className={styles.terms}>
                <div>
                  <dt>Состояние</dt>
                  <dd>
                    <Tag tone={data.status === "ok" ? "success" : "danger"}>
                      {data.status === "ok" ? "работает" : data.status}
                    </Tag>
                  </dd>
                </div>
                <div>
                  <dt>База данных</dt>
                  <dd>{DB_TITLES[data.db] ?? data.db}</dd>
                </div>
                <div>
                  <dt>Версия</dt>
                  <dd>{data.version}</dd>
                </div>
              </dl>
            )}
          </ResourceView>
        </Card>

        <Card title="Сервисы" aria-label="Сервисы">
          <ResourceView state={services.state} onRetry={services.reload} skeletonLines={2}>
            {({ services: list, integrity }) => {
              const running = list.filter((item) => item.state === "running").length;
              return (
                <>
                  <p className={styles.lead}>
                    Работают {running} из {list.length}
                  </p>
                  <ul className={styles.list}>
                    {list
                      .filter((item) => item.state !== "running")
                      .map((item) => (
                        <li key={item.id}>
                          {item.name}{" "}
                          <Tag tone={item.state === "degraded" ? "warning" : "danger"}>
                            {item.state === "degraded" ? "сбой" : "остановлен"}
                          </Tag>
                        </li>
                      ))}
                  </ul>
                  <p className={styles.muted}>
                    Целостность данных: {integrity.ok ? "в порядке" : "нарушена"}. {integrity.details}
                  </p>
                  <Link href={ROUTES.adminSystem}>Управление сервисами</Link>
                </>
              );
            }}
          </ResourceView>
        </Card>

        <Card title="Пользователи" aria-label="Пользователи">
          <ResourceView state={users.state} onRetry={users.reload} skeletonLines={2}>
            {(list) => {
              const counts = countActiveByRole(list);
              return (
                <>
                  <dl className={styles.terms}>
                    {ROLES.map((role) => (
                      <div key={role}>
                        <dt>{ROLE_TITLES[role]}</dt>
                        <dd>{counts[role]} активных</dd>
                      </div>
                    ))}
                  </dl>
                  <Link href={ROUTES.adminUsers}>Учётные записи</Link>
                </>
              );
            }}
          </ResourceView>
        </Card>
      </div>

      <Card title="Нагрузка" aria-label="Нагрузка">
        <ResourceView state={monitoring.state} onRetry={monitoring.reload} skeletonLines={4}>
          {(data) => (
            <>
              <StatGroup>
                <StatTile
                  label="Активные сессии"
                  value={last(data.series.activeSessions) ?? "—"}
                  note={`лимит ${data.norms.sessionLimit}`}
                />
                <StatTile label="Процессор" value={`${last(data.series.cpuPercent) ?? "—"}%`} />
                <StatTile label="Память" value={`${last(data.series.memoryPercent) ?? "—"}%`} />
                <StatTile
                  label="Отклик"
                  value={`${last(data.series.responseSec) ?? "—"} с`}
                  note={`норматив ${data.norms.responseSec} с`}
                  tone={(last(data.series.responseSec) ?? 0) > data.norms.responseSec ? "bad" : "good"}
                />
              </StatGroup>
              <NormChart
                title="Активные сессии"
                labels={data.labels}
                values={data.series.activeSessions}
                seriesName="Активные сессии"
                norm={{ value: data.norms.sessionLimit, label: "лимит сессий" }}
              />
            </>
          )}
        </ResourceView>
      </Card>

      <Card
        title="Последние события"
        aria-label="Последние события"
        actions={<Link href={ROUTES.adminAudit}>Весь журнал</Link>}
      >
        <ResourceView state={audit.state} onRetry={audit.reload} skeletonLines={4}>
          {(data) => (
            <DataTable
              caption="Последние события аудита"
              columns={auditColumns}
              rows={data.items}
              getRowKey={(row) => row.id}
              emptyText="Событий пока нет."
            />
          )}
        </ResourceView>
      </Card>
    </section>
  );
}
