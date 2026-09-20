/*
 * Типы прототипа волны 0, выведенные из самих JSON. Оставлены ТОЛЬКО там, где UI волны 0 опирается на
 * «усиленную» форму мока (напр. evaluation у каждой попытки, visKlass у каждой фикстуры) и строгий контракт
 * его бы сломал. Контрактные версии — *Contract в public API (spec/05-data-models.md); при переводе UI на
 * клиент мок-слоя (волна 2) UI переходит на контрактные типы, а этот файл удаляется.
 */
import type armCardsJson from "@mocks/fixtures/arm-cards.json";
import type reportsJson from "@mocks/reports.json";
import type sessionsJson from "@mocks/sessions.json";

/** @deprecated прототип волны 0 → ArmCardFixtureContract */
export type ArmCardFixture = (typeof armCardsJson)["cards"][number];
/** @deprecated прототип волны 0 → NotificationEntryContract */
export type NotificationEntry = ArmCardFixture["notificationList"][number];
/** @deprecated прототип волны 0 → ServiceStatusEvent */
export type NotificationStatus = NotificationEntry["statuses"][number];
/** @deprecated прототип волны 0 → WorkLineContract */
export type WorkLine = ArmCardFixture["workLines"][number];
/** @deprecated прототип волны 0 → SessionContract */
export type Session = (typeof sessionsJson)["sessions"][number];
/** @deprecated прототип волны 0 → CardEventContract */
export type CardEvent = Session["cardEvents"][number];
/** @deprecated прототип волны 0 → ReportContract */
export type Report = (typeof reportsJson)["reports"][number];

/** @deprecated прототип волны 0: общая форма описания статуса (ДДС или службы). Контракт — DdsStatusDef/ServiceStatusDef. */
export interface StatusRef {
  status: string;
  title: string;
  requiresComment: boolean;
  next: string[];
}
