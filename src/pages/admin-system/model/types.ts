import type {
  AuditLogEntry,
  PublicUser,
  SystemIntegrity,
  SystemLogEntry,
  SystemService,
  SystemSettings,
} from "@/shared/api";

/** Состояние загрузки секции: один и тот же контракт у всех вкладок раздела. */
export type LoadState<TData> =
  | { status: "loading" }
  | { status: "error"; message: string; isOffline: boolean }
  | ({ status: "ready" } & TData);

export type SystemOverview = {
  services: SystemService[];
  integrity: SystemIntegrity;
  settings: SystemSettings;
  logs: SystemLogEntry[];
  /** Идёт занятие: блокируются действия, влияющие на учебный процесс (ТЗ §8). */
  sessionRunning: boolean;
};

/** Строка журнала аудита по образцу экрана «аудит» ПОВ-112: Дата и Время — раздельно. */
export type AuditRow = {
  id: string;
  cardId?: string;
  operatorArm?: number;
  fullName: string;
  roleTitle: string;
  date: string;
  time: string;
  event: string;
  details: string;
};

export type AuditQuery = {
  text: string;
  type: string;
  byOperator: boolean;
  byCard: boolean;
  from: string;
  to: string;
};

export const EMPTY_AUDIT_QUERY: AuditQuery = {
  text: "",
  type: "",
  byOperator: true,
  byCard: true,
  from: "",
  to: "",
};

export type AuditSource = { entries: AuditLogEntry[]; users: PublicUser[] };
