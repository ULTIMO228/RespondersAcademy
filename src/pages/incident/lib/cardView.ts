import { mergeTrainingCard } from "@/entities/incident";
import { resolveTraineeServiceId } from "@/entities/service";
import type { NotificationEntryContract, ServiceRef } from "@/shared/api";

import { MY_SERVICE_KIND, PHONE_ONLY_KIND, SERVICE_ADDED } from "../model/constants";

/* Связка учебной карточки и UI-фикстуры — общее правило entities/incident (используется и зеркалом монитора). */
export { mergeTrainingCard };

/**
 * «Моя служба» обучающегося: служба его профиля (User.service, спека 012 FR-007). Без профиля — прежнее правило
 * MY_SERVICE_KIND: первая служба АРМ-112 списка оповещения, иначе первая не «только телефонная».
 */
export function pickMyServiceId(
  notificationList: { serviceId: string }[],
  services: ServiceRef[],
  userService?: string,
): string | undefined {
  const trainee = resolveTraineeServiceId(userService, services);
  if (trainee) return trainee;
  const kindOf = (serviceId: string) => services.find((service) => service.id === serviceId)?.kind;
  const ids = notificationList.map((entry) => entry.serviceId);
  return ids.find((id) => kindOf(id) === MY_SERVICE_KIND) ?? ids.find((id) => kindOf(id) !== PHONE_ONLY_KIND);
}

/**
 * Список оповещения с плиткой своей службы: карточка пришла обучающемуся, значит направлена в его службу. Если её
 * нет в списке фикстуры, она ставится первой со статусом «Добавлена» — тем же, что у остальных служб списка
 * (система-112 оповещает их одновременно), иначе на момент создания карточки (спека 012 FR-007).
 */
export function withMyService<T extends { createdAt: string; notificationList: NotificationEntryContract[] }>(
  card: T,
  myServiceId: string | undefined,
): T {
  if (!myServiceId || card.notificationList.some((entry) => entry.serviceId === myServiceId)) return card;
  const firstAdded = card.notificationList
    .flatMap((entry) => entry.statuses)
    .find((event) => event.status === SERVICE_ADDED);
  const added: NotificationEntryContract = {
    serviceId: myServiceId,
    addedBy: "auto",
    statuses: [firstAdded ?? { status: SERVICE_ADDED, at: card.createdAt, actor: "оп. 0" }],
  };
  return { ...card, notificationList: [added, ...card.notificationList] };
}
