/*
 * Коды «главной службы» классификатора (classifier.json → mainService, колонка 12 xlsx) → id службы
 * из reference.services. Основные службы типа происшествия в панели «Службы:» подчёркнуты двойной
 * линией (spec/04-pages/02-arm-card.md п. 6). Коды без службы в справочнике не отображаются.
 */
export const MAIN_SERVICE_CODE_TO_ID: Record<string, string> = {
  MCHS: "svc-101",
  Police: "svc-102",
  AMBULANCE: "svc-103",
  MOSGAZ: "svc-104",
  MOSLIFT: "svc-moslift",
  MOSVODOCANAL: "svc-mvk",
  MOEK: "svc-moek",
  MOESK: "svc-moesk",
  OEK: "svc-oek",
  MOSGORTRANS: "svc-mgt",
  METRO: "svc-metro",
  MGTS: "svc-mgts",
  MOSVODOSTOK: "svc-mosvodostok",
  MOSCOLLECTOR: "svc-moskollector",
  GORMOST: "svc-gormost",
  GKH: "svc-gkh",
  ZODD: "svc-zodd",
  ZEMP: "svc-zemp",
  AUTOROADS: "svc-avtodor",
  MSPPN: "svc-msppn",
};

const CODE_SEPARATOR = ",";

/** «METRO, MZD» → ["svc-metro"]. */
export function getMainServiceIds(mainService: string): string[] {
  return mainService
    .split(CODE_SEPARATOR)
    .map((code) => MAIN_SERVICE_CODE_TO_ID[code.trim()])
    .filter((serviceId): serviceId is string => Boolean(serviceId));
}
