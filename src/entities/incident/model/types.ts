import type { StatusTone } from "@/shared/ui";

/* Списочная проекция происшествия для экрана «Поиск происшествий» (spec/04-pages/01-arm-main.md). */

/** Состояние строки: обычная, новая неоткрытая (таймер 30 сек) или нарушение (таймер истёк). */
export type IncidentRowState = "normal" | "new" | "violation";

/** Роль карточки в цепочке связей (источник п. 1.3, 3.11). */
export type IncidentLinkRole = "главная" | "подчинённая";

export type IncidentLink = {
  id: string;
  number: number;
  role: IncidentLinkRole;
  href: string;
  isCurrent: boolean;
};

export type IncidentServiceStatus = {
  code: string;
  title: string;
  tone: StatusTone;
};

export type IncidentDescription = {
  /** «17.09.2026 11:13:19 УМЦ О.п.» — служебная часть, приглушённым цветом. */
  meta: string;
  /** Текст оператора — жирным. */
  text: string;
};

export type IncidentPreviewService = {
  name: string;
  status: IncidentServiceStatus;
};

export type IncidentPreviewStatus = {
  at: string;
  actor: string;
  serviceName: string;
  statusTitle: string;
  comment: string;
};

/** Краткая сводка для модалки предпросмотра (памятка стр. 14). */
export type IncidentPreview = {
  applicant: string;
  phone: string;
  cardStatus: string;
  services: IncidentPreviewService[];
  recentStatuses: IncidentPreviewStatus[];
};

export type IncidentListItem = {
  id: string;
  href: string;
  number: number;
  createdAt: string;
  operatorNumber: string;
  armNumber: string;
  typeName: string;
  typeCode: string;
  victims: string;
  address: string;
  serviceStatus: IncidentServiceStatus;
  /** «ЧС»/«ЧП» — красный бейдж; null — нет. */
  emergencyMark: string | null;
  smsCount: number;
  description: IncidentDescription | null;
  links: IncidentLink[];
  isImportant: boolean;
  /** «Пустая карточка» — завершена без обработки («Нет контакта»/«Срыв звонка», источник п. 3.4). */
  isEmpty: boolean;
  state: IncidentRowState;
  /** Выдача карточки в занятии (CardFlowItem.issuedAt) — отсчёт таймера 30 сек; null — карточка журнала. */
  issuedAt: string | null;
  /** Остаток таймера первичной реакции «0:30»…«0:00» (считает лента по issuedAt); null — таймера нет. */
  reactionTimer: string | null;
  preview: IncidentPreview;
};
