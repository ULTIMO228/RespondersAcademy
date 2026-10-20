/*
 * Профиль режима обучаемого (spec/008): курсант с профилем получает задания только своего режима.
 * Источник истины — сервер (backend/app/services/training_profile.py); здесь — подписи и та же проверка для подсказок UI.
 */
import type { TrainingProfile } from "@/shared/api";

export const TRAINING_PROFILE_TITLES: Record<TrainingProfile, string> = {
  operator112: "Специалист системы-112",
  dds: "Диспетчер ДДС",
};

export const NO_PROFILE_TITLE = "Не задан";

/** Короткая метка рядом с ФИО (мастер назначения). */
export const PROFILE_SHORT: Record<TrainingProfile, string> = { operator112: "112", dds: "ДДС" };

/** Родительный падеж для «профиль специалиста-112» в пояснениях. */
export const PROFILE_GENITIVE: Record<TrainingProfile, string> = {
  operator112: "специалиста-112",
  dds: "диспетчера ДДС",
};

/** Нет профиля — доступны оба режима; иначе только режим профиля. */
export function allowsMode(user: { trainingProfile?: TrainingProfile }, mode: TrainingProfile): boolean {
  return user.trainingProfile === undefined || user.trainingProfile === mode;
}
