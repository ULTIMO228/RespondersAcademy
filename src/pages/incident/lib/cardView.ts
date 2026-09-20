import { mergeTrainingCard } from "@/entities/incident";
import type { ServiceRef } from "@/shared/api";

import { MY_SERVICE_KIND, PHONE_ONLY_KIND } from "../model/constants";

/* Связка учебной карточки и UI-фикстуры — общее правило entities/incident (используется и зеркалом монитора). */
export { mergeTrainingCard };

/** «Моя служба» обучающегося — см. MY_SERVICE_KIND. */
export function pickMyServiceId(
  notificationList: { serviceId: string }[],
  services: ServiceRef[],
): string | undefined {
  const kindOf = (serviceId: string) => services.find((service) => service.id === serviceId)?.kind;
  const ids = notificationList.map((entry) => entry.serviceId);
  return ids.find((id) => kindOf(id) === MY_SERVICE_KIND) ?? ids.find((id) => kindOf(id) !== PHONE_ONLY_KIND);
}

/** Краткие имена служб списка оповещения — варианты поля «Служба» формы отработки. */
export function getServiceNames(notificationList: { serviceId: string }[], services: ServiceRef[]): string[] {
  return notificationList.map(
    (entry) => services.find((service) => service.id === entry.serviceId)?.shortName ?? entry.serviceId,
  );
}
