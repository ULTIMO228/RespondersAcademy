import type { ClassifierEntry } from "@/shared/api";

import type { JournalEntry } from "../lib/parseJournal";

export type LinkedCard = {
  id: string;
  number: number;
  role: "главная" | "подчинённая";
  finalType: string;
};

/** Строка отработки (WorkLine фикстуры / CardWorkLine мок-слоя). */
export type WorkLineData = {
  operator: string;
  at: string;
  service: string;
  calledTo: string;
  person: string;
  message: string;
};

/**
 * Данные рабочей карточки, которые рендерит виджет: структурное подмножество ArmCardFixture — ему
 * соответствуют и контрактная фикстура мок-слоя (ArmCardFixtureContract), и прототипная (волна 0).
 */
export type IncidentCardData = {
  id: string;
  number: number;
  createdAt: string;
  registeredBy: string;
  source?: string;
  phones: { aon: string; provided: string; onSite: string };
  smsList?: string[];
  applicant: { name: string; status: string };
  address: {
    formal: string;
    okrug: string;
    raion: string;
    descriptive: string;
    geo?: { lat: number; lon: number } | null;
  };
  what: {
    pollAnswers: string;
    signs: string[];
    finalType: string;
    klass: string;
    visKlass?: string;
    casualties: { injured: boolean; ambulanceRefused: boolean; blocked: boolean };
    classifierCode?: string;
  };
  description: string;
  workLines: WorkLineData[];
  emergency: { chs: boolean; chp: boolean };
  createdByVis: boolean;
};

/** Режим дополнения (Shift+F2) и мок-блокировка параллельного редактирования (T2.3-15). */
export type AmendControl = {
  isActive: boolean;
  isBlocked: boolean;
  /** Уведомление блокировки: «Вы не можете вносить изменения» / о доступности. */
  notice: string | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  onSiteDigits: string;
  onOnSiteChange: (digits: string) => void;
  onStart: () => void;
  onView: () => void;
  onSave: () => void;
};

export type FlagsControl = {
  /** Сценарий разрешает редактирование (карандаш активен). */
  canEdit: boolean;
  emergency: { chs: boolean; chp: boolean };
  onToggle: (flag: "chs" | "chp") => void;
};

/**
 * Живой режим карточки обучающегося (волна 2): управление из pages/incident. Без controls виджет работает
 * локально (прототип, просмотр преподавателем) и не обращается к API.
 */
export type IncidentCardControls = {
  /** Карточка закрыта для редактирования («Работы завершены» / «Отказ…»). */
  isLocked: boolean;
  isReactionExceeded?: boolean;
  amend: AmendControl;
  flags: FlagsControl;
  /** Записи журнала, добавленные в тренажёре (дополнения). */
  journalExtra: JournalEntry[];
  /** Входящая СМС-карточка: полигон местоположения на локальной карте (п. 14). */
  showSmsPolygon: boolean;
};

/**
 * Контракт виджета карточки (верх карточки: телефония, шапка, заявитель, адрес, журнал, «Что случилось», связи). Используется pages/incident, pages/teacher-monitor,
 * pages/teacher-scenario-editor. Поля не переименовывать; новые — только опциональные.
 */
export type IncidentCardViewProps = {
  card: IncidentCardData;
  classifierEntries: ClassifierEntry[];
  linkedCards: LinkedCard[];
  isExceeded?: boolean;
  readOnly?: boolean;
  /** Режим обучающегося-ДДС: поля и действия, принадлежащие 112, только для чтения. */
  isDdsLearner?: boolean;
  /** Ссылка-переключатель состояния норматива (dev: «?state=exceeded»); без неё таймер не кликабелен. */
  stateToggleHref?: string;
  /** Тренажёрный таймер отработки, по умолчанию «3:00» (статичная строка волны 0). */
  timerValue?: string;
  /** Выполненный норматив 30 сек, по умолчанию «0:18». */
  reactionValue?: string;
  /**
   * Таймер и «Реакция» в шапке (по умолчанию да). У обучающегося-ДДС — нет: в АРМ-112 ДДС их нет (памятка стр. 23),
   * нормативы показывает полоса тренажёра (спека 012, FR-001/FR-002). Зеркало преподавателя таймер оставляет.
   */
  showTimer?: boolean;
  /** Живой режим обучающегося (данные и действия из pages/incident). */
  controls?: IncidentCardControls;
};
