/* Типы-словари занятия (spec/05-data-models.md §7). Данные — в @/shared/api. */
export type SessionState = "draft" | "configured" | "running" | "finished" | "reported";
export type SessionMode = "demo" | "follow" | "practice";
export type CardSource = "generated" | "studentCreated" | "mixed";

/** Состояние курсанта на плитке мониторинга (spec/04-pages/10, 12 «Состояния»). */
export type StudentLiveState = "waiting" | "working" | "finished" | "offline";

export type Severity = "critical" | "major" | "minor";

/** Строка профильной привязки «служба/группа → группы ЕКП» (spec/04-pages/11). */
export type ProfileCategoryRow = {
  id: string;
  profile: string;
  groupName?: string;
  incidentGroups: string[];
  serviceIds: string[];
};
