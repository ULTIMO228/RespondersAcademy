import { PRIMARY_DDS_STATUSES } from "@/entities/service";
import { buildStatusMachine } from "@/shared/lib";
import type { StatusMachine } from "@/shared/lib";

import type { StatusFormValues, StatusOption, StatusSequenceRef } from "./types";

/*
 * «Работы завершены» / «Отказ…» закрывают карточку для редактирования (памятка стр. 22) — финальные статусы
 * графа (без исходящих переходов в reference.ddsStatuses). Список оставлен для обратной совместимости.
 */
export const FINAL_STATUSES: readonly string[] = ["workDone", "workRefused"];

type StatusOptionsInput = {
  ddsStatuses: StatusSequenceRef[];
  /** Прежний источник графа (волна 0). Не используется: граф — только reference.ddsStatuses. */
  serviceStatuses?: StatusSequenceRef[];
  /** Текущий статус ДДС карточки; null / "" / статус службы («Добавлена», «Получена службой») — статуса нет. */
  currentStatus: string | null;
};

/** Машина статусов ДДС по справочнику: старт — «Принята» / «Не принята», далее — по ddsStatuses[].next. */
export function createStatusFormMachine(ddsStatuses: StatusSequenceRef[]): StatusMachine<string> {
  return buildStatusMachine<string>(ddsStatuses, { initial: PRIMARY_DDS_STATUSES });
}

/** Текущий статус для машины: не-ДДС статусы (added/received) означают «статуса ещё нет». */
export function toDdsCurrent(machine: StatusMachine<string>, currentStatus: string | null): string | null {
  return currentStatus && machine.hasStatus(currentStatus) ? currentStatus : null;
}

/**
 * Пункты дропдауна «Статус» в порядке reference.ddsStatuses: доступные — только переходы графа
 * (памятка стр. 25: после «Не принята» — только «Принята»), остальные видны неактивными.
 */
export function getStatusOptions({ ddsStatuses, currentStatus }: StatusOptionsInput): StatusOption[] {
  const machine = createStatusFormMachine(ddsStatuses);
  const nextStatuses = machine.nextStatuses(toDdsCurrent(machine, currentStatus));
  return ddsStatuses.map<StatusOption>((ref) => ({
    status: ref.status,
    title: ref.title,
    isAvailable: nextStatuses.includes(ref.status),
    requiresComment: ref.requiresComment,
    isFinal: machine.isFinal(ref.status),
  }));
}

/** Статус закрывает карточку для редактирования («Работы завершены» / «Отказ от выполнения работ»). */
export function isClosingStatus(ddsStatuses: StatusSequenceRef[], status: string | null): boolean {
  return status !== null && createStatusFormMachine(ddsStatuses).isFinal(status);
}

/** Комментарий обязателен для «Не принята» / «Отказ от выполнения работ» — без него ✓ неактивна. */
export function canSubmitStatus(values: StatusFormValues, options: StatusOption[]): boolean {
  const option = options.find((item) => item.status === values.status);
  if (!option?.isAvailable) return false;
  return !option.requiresComment || values.comment.trim().length > 0;
}
