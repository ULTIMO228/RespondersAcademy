import type { ServiceRef } from "@/shared/api";
import { PROFILE_MAPPING_SEED } from "@/shared/config";

/**
 * Служба обучающегося («своя служба» в карточке и журнале, спека 012 FR-007): User.service → профиль в
 * PROFILE_MAPPING_SEED → первая служба профиля (для ДДС района — управа). Если профиля нет — служба с тем же
 * полным названием. Неизвестная справочнику служба — undefined.
 */
export function resolveTraineeServiceId(
  userService: string | undefined,
  services: ServiceRef[],
): string | undefined {
  if (!userService) return undefined;
  const known = (id: string | undefined) => (services.some((service) => service.id === id) ? id : undefined);
  const profile = PROFILE_MAPPING_SEED.find((row) => row.profile === userService);
  return known(profile?.serviceIds[0]) ?? services.find((service) => service.name === userService)?.id;
}
