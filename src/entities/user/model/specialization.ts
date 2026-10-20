import type { PublicUser, Specialization } from "@/shared/api";
import { ROUTES } from "@/shared/config";

/** Минимум полей пользователя, нужных для проверки зоны (подходит и для сессии, и для профиля). */
type SpecializedUser = Pick<PublicUser, "role" | "specializations">;

/** Все зоны в стабильном порядке показа: сначала «112», затем «ДДС». */
export const ALL_ZONES: readonly Specialization[] = ["operator112", "dds"];

/** Подписи специализаций (панель «В кабинет», админка). */
export const SPECIALIZATION_TITLES: Record<Specialization, string> = {
  operator112: "Специалист 112",
  dds: "Оператор ДДС",
};

/** Входная страница зоны: журнал ДДС или рабочее место специалиста 112. */
export const ZONE_HOME: Record<Specialization, string> = {
  operator112: ROUTES.armOperator112,
  dds: ROUTES.arm,
};

/**
 * Зоны, доступные пользователю. Преподаватель и администратор не ограничиваются специализацией (режим просмотра);
 * у обучающегося без поля действует «dds» — как миграция бэкенда для ранее заведённых учёток (спека 007).
 */
export function zonesOf(user: SpecializedUser): Specialization[] {
  if (user.role !== "student") return [...ALL_ZONES];
  const own = user.specializations ?? ["dds"];
  return ALL_ZONES.filter((zone) => own.includes(zone));
}

/** Допущен ли пользователь в зону `mode`. */
export function hasSpecialization(user: SpecializedUser, mode: Specialization): boolean {
  return zonesOf(user).includes(mode);
}

/** Короткая метка специализации рядом с ФИО (мастер назначения): «112» / «ДДС». */
export const SPECIALIZATION_SHORT: Record<Specialization, string> = { operator112: "112", dds: "ДДС" };

/**
 * «Профиль режима» spec/008, выраженный через специализации (спека 021): единственная специализация обучающегося;
 * у обучающегося с обеими, у преподавателя и администратора — undefined («не задан»).
 */
export function singleSpecialization(user: SpecializedUser): Specialization | undefined {
  if (user.role !== "student") return undefined;
  const zones = zonesOf(user);
  return zones.length === 1 ? zones[0] : undefined;
}
