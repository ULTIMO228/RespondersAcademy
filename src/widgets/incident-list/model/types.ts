import type { District } from "@/shared/api";

/* Контракты данных экрана «Поиск происшествий» (клиентские хуки ленты; данные — через @/shared/api). */

export type JournalOperator = {
  /** «оп. 1 , Иванов С. П.» */
  operatorLabel: string;
  /** «АРМ 001» */
  armLabel: string;
};

export type JournalClock = {
  iso: string;
  /** «Четверг, 17 Сентябрь 2026» */
  dateLabel: string;
  /** «11:24» */
  hourMinute: string;
  /** «26» */
  seconds: string;
};

/** Бейдж активного занятия в шапке ленты: название + оставшееся время. */
export type JournalSession = {
  title: string;
  remaining: string;
};

/** Узел дерева признаков происшествия (как в опросной карте): уровни 1–3. */
export type SignTreeNode = {
  label: string;
  children: SignTreeNode[];
};

export type OkrugOption = District;

/** Значение мультиселекта: value уходит в запрос, label — подпись чипа. */
export type ChoiceOption = {
  value: string;
  label: string;
};

/** Значения мультиселектов расширенного поиска — справочники мок-слоя. */
export type AdvancedSearchOptions = {
  arms: ChoiceOption[];
  services: ChoiceOption[];
  channels: ChoiceOption[];
  sources: ChoiceOption[];
  cardStatuses: ChoiceOption[];
  districts: OkrugOption[];
  signTree: SignTreeNode[];
};

/** Карточка очереди модуля: id + группа ЕКП (для профильного фильтра при старте занятия). */
export type ModuleCard = {
  id: string;
  group: string;
};

/** Назначенный преподавателем модуль (сценарий approved из занятия курсанта). */
export type AssignedModule = {
  id: string;
  title: string;
  /** Бейдж занятия: «Билет 05». */
  shortTitle: string;
  categories: string[];
  difficulty: number;
  levelTitle: string;
  deadline: string;
  teacherId: string;
  cards: ModuleCard[];
};

/** Занятие, запущенное курсантом из «Мои назначенные модули» (переживает перезагрузку страницы). */
export type ActiveSession = {
  sessionId: string;
  scenarioId: string;
  title: string;
  startedAt: string;
  endsAt: string;
};

/** Загрузка данных ленты: offline — нет соединения (ApiError status 0). */
export type LoadStatus = "loading" | "ready" | "error" | "offline";
