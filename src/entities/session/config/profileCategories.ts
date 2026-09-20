import { PROFILE_MAPPING_SEED } from "@/shared/config";

import type { ProfileCategoryRow } from "../model/types";

/*
 * Профильные категории обучающихся — пример таблицы spec/04-pages/11 («Профильные категории»).
 * Группы ЕКП — дословно из classifier.json (entries[].group). Источник значений один (T3.1-09):
 * сид `PROFILE_MAPPING_SEED` из shared/config — его же читает мок-слой, чтобы таблица привязки на
 * `/teacher/scenarios` и профильный фильтр ленты курсанта жили от одних данных. Сохранённая
 * преподавателем привязка приходит из `GET /api/mock/profile-mapping`.
 */
export const PROFILE_CATEGORIES: ProfileCategoryRow[] = PROFILE_MAPPING_SEED.map((row) => ({ ...row }));
