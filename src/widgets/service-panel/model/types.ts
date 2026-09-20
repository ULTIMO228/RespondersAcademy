import type { ServiceStatusEvent } from "@/entities/service";
import type { ServiceRef, StatusRef } from "@/shared/api";
import type { StatusFormValues } from "@/features/status-form";

/** Данные карточки для панели: список оповещения (NotificationEntry фикстуры / контракта мок-слоя). */
export type ServicePanelCard = {
  notificationList: {
    serviceId: string;
    statuses: { status: string; at: string; actor: string; comment?: string }[];
  }[];
};

export type ServiceHistory = Record<string, ServiceStatusEvent[]>;

/**
 * Контракт нижней тёмной панели «Службы:» (T0.2-11/12). Используется pages/incident и pages/teacher-monitor.
 * Поля не переименовывать; новые — только опциональные.
 */
export type ServicePanelProps = {
  card: ServicePanelCard;
  services: ServiceRef[];
  serviceStatuses: StatusRef[];
  ddsStatuses: StatusRef[];
  /** Служба обучающегося («моя служба»): у её плитки — «конверт» и «карандаш». */
  myServiceId?: string;
  readOnly?: boolean;
  /** Основные службы типа происшествия (главная служба классификатора) — двойное подчёркивание. */
  mainServiceIds?: string[];
  /** Счётчик на иконке чата. */
  chatUnreadCount?: number;
  /** Живой режим: история статусов служб (иначе — из фикстуры, локально). */
  history?: ServiceHistory;
  /** Текущий статус ДДС карточки (мок-слой) — источник доступных переходов формы. */
  currentDdsStatus?: string | null;
  /** Сохранение статуса (POST /cards/[id]/status); отклонение — ошибка в форме. */
  onStatusSubmit?: (values: StatusFormValues) => Promise<void>;
  /** Карточка закрыта для редактирования — карандаш скрыт. */
  isStatusLocked?: boolean;
  /** Управляемое открытие формы статуса (горячие клавиши страницы). */
  isStatusFormOpen?: boolean;
  onStatusFormOpenChange?: (isOpen: boolean) => void;
};
