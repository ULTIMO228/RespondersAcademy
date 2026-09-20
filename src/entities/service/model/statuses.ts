/*
 * Фасады статусных машин ДДС и служб (T1.2-01). Граф — только из справочника reference.json
 * (ddsStatuses / serviceStatuses, поле next): вызывающий код передаёт данные ридера, код переходов не хранит.
 *
 * РАСХОЖДЕНИЕ (12-tasks.md, №2): spec/05-data-models.md §2.2 описывает 5 статусов служб, в reference.json
 * фактически 9 (+ responseStarted/arrived/workInProgress/workRefused) — машина строится по фактическим данным.
 * РАСХОЖДЕНИЕ: §2.1 и 02-arm-card.md §7 допускают «Отказ от выполнения работ» на любом этапе после «Принята»,
 * а в reference.json ddsStatuses переход в workRefused есть только из workInProgress — действует справочник.
 */
import { buildStatusMachine } from "@/shared/lib";
import type { StatusMachine } from "@/shared/lib";
import type { DdsStatus, DdsStatusDef, ServiceStatus, ServiceStatusDef } from "@/shared/api";

/**
 * Первичный статус ДДС — выбор строго из двух (spec/05-data-models.md §2.1; reference.json → meta.ddsStatusesNote;
 * памятка стр. 25). Это не рёбра графа, а точка входа: переходы дальше — только из next справочника.
 * Статусы, которых нет в справочнике, машина отбрасывает.
 */
export const PRIMARY_DDS_STATUSES: readonly DdsStatus[] = ["accepted", "notAccepted"];

export type DdsStatusMachine = StatusMachine<DdsStatus>;
export type ServiceStatusMachine = StatusMachine<ServiceStatus>;

/** Машина статусов ДДС: старт → accepted | notAccepted, далее — по reference.ddsStatuses[].next. */
export function createDdsStatusMachine(defs: readonly DdsStatusDef[]): DdsStatusMachine {
  return buildStatusMachine(defs, { initial: PRIMARY_DDS_STATUSES });
}

/** Машина статусов службы: старт — статусы без входящих рёбер (added), далее — по serviceStatuses[].next. */
export function createServiceStatusMachine(defs: readonly ServiceStatusDef[]): ServiceStatusMachine {
  return buildStatusMachine(defs);
}
