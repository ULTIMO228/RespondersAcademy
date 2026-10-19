/* Зависимости страницы «Карта ошибок»: список групп преподавателя и карта выбранной группы и разбор её этапа. */
import {
  getErrorMapGroup,
  getErrorMapJournal,
  getErrorMapStage,
  getErrorMapStudent,
  getErrorMapStudentStage,
  listErrorMapGroups,
} from "@/shared/api";
import type {
  ErrorMapGroup,
  ErrorMapJournalResponse,
  ErrorMapMode,
  ErrorMapPeriod,
  ErrorMapResponse,
  ErrorMapStageDetail,
} from "@/shared/api";

export type ErrorMapApi = {
  groups: (signal?: AbortSignal) => Promise<ErrorMapGroup[]>;
  map: (
    groupId: string,
    query: { mode: ErrorMapMode; period: ErrorMapPeriod },
    signal?: AbortSignal,
  ) => Promise<ErrorMapResponse>;
  stage: (
    groupId: string,
    stageId: string,
    query: { mode: ErrorMapMode; period: ErrorMapPeriod },
    signal?: AbortSignal,
  ) => Promise<ErrorMapStageDetail>;
};

export const errorMapApi: ErrorMapApi = {
  groups: (signal) => listErrorMapGroups(signal),
  map: (groupId, query, signal) => getErrorMapGroup(groupId, query, signal),
  stage: (groupId, stageId, query, signal) => getErrorMapStage(groupId, stageId, query, signal),
};

/** Зависимости страницы обучающегося: его карта, разбор этапа и список групп (для имени группы). */
export type StudentMapApi = {
  groups: ErrorMapApi["groups"];
  student: (
    studentId: string,
    query: { mode: ErrorMapMode; period: ErrorMapPeriod },
    signal?: AbortSignal,
  ) => Promise<ErrorMapResponse>;
  studentStage: (
    studentId: string,
    stageId: string,
    query: { mode: ErrorMapMode; period: ErrorMapPeriod },
    signal?: AbortSignal,
  ) => Promise<ErrorMapStageDetail>;
};

export const studentMapApi: StudentMapApi = {
  groups: (signal) => listErrorMapGroups(signal),
  student: (studentId, query, signal) => getErrorMapStudent(studentId, query, signal),
  studentStage: (studentId, stageId, query, signal) =>
    getErrorMapStudentStage(studentId, stageId, query, signal),
};

/** Зависимости страницы «Журнал группы»: список групп (имя группы, смена группы) и сам журнал. */
export type JournalApi = {
  groups: ErrorMapApi["groups"];
  journal: (
    groupId: string,
    query: { mode: ErrorMapMode; period: ErrorMapPeriod },
    signal?: AbortSignal,
  ) => Promise<ErrorMapJournalResponse>;
};

export const journalApi: JournalApi = {
  groups: (signal) => listErrorMapGroups(signal),
  journal: (groupId, query, signal) => getErrorMapJournal(groupId, query, signal),
};
