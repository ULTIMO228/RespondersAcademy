import type { IncidentDescription } from "./types";

/* Разбор строковых полей моков в списочную проекцию (чистые функции без зависимостей). */

const OPERATOR_PATTERN = /Опер\.\s*(\d+)/;
const ARM_PATTERN = /АРМ\s*(\d+)/;
const DESCRIPTION_SEPARATOR = / [-—] /;
const COUNTRY_PREFIX = "Россия, ";
const SERVICE_CODE_PATTERN = /^(\d{3})/;
const SERVICE_ID_CODE_PATTERN = /^svc-(\d{3})$/;
/** В ленте ДДС у поступившей, но не взятой в работу карточки оператор — «0» (ДДС_image3–5). */
export const UNASSIGNED_OPERATOR = "0";

export type RegisteredBy = {
  operatorNumber: string;
  armNumber: string;
};

/** «Опер. 4, АРМ 4, УМЦ О.п.» → { operatorNumber: "4", armNumber: "4" }. */
export function parseRegisteredBy(registeredBy: string): RegisteredBy {
  return {
    operatorNumber: OPERATOR_PATTERN.exec(registeredBy)?.[1] ?? UNASSIGNED_OPERATOR,
    armNumber: ARM_PATTERN.exec(registeredBy)?.[1] ?? "",
  };
}

/** «17.09.2026 11:13:19 УМЦ О.п. - Пожар в квартире» → служебная часть + текст (ДДС_image3). */
export function splitDescription(description: string): IncidentDescription | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const match = DESCRIPTION_SEPARATOR.exec(trimmed);
  if (!match) return { meta: "", text: trimmed };
  return {
    meta: `${trimmed.slice(0, match.index)} -`,
    text: trimmed.slice(match.index + match[0].length),
  };
}

/** Формальный адрес в ленте — без страны: «Москва, (ТАО, Вороновское), …». */
export function formatListAddress(address: string): string {
  return address.startsWith(COUNTRY_PREFIX) ? address.slice(COUNTRY_PREFIX.length) : address;
}

/** Код типа для тултипа: номер главной экстренной службы («101»). */
export function pickCodeFromServiceIds(serviceIds: string[], fallback: string): string {
  for (const serviceId of serviceIds) {
    const code = SERVICE_ID_CODE_PATTERN.exec(serviceId)?.[1];
    if (code) return code;
  }
  return fallback;
}

/** «103 (главная)» → «103». */
export function pickCodeFromServiceLabels(labels: string[], fallback: string): string {
  for (const label of labels) {
    const code = SERVICE_CODE_PATTERN.exec(label)?.[1];
    if (code) return code;
  }
  return fallback;
}
