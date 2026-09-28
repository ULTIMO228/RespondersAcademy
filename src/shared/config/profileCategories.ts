/*
 * Сид профильных категорий обучающихся (spec/000-фронт/04-pages/11-teacher-scenarios.md «Профильные категории»,
 * сценарий А шаг 5). Данные лежат в shared, потому что их читают и мок-слой (сид таблицы привязки
 * в store), и слой entities (`@/entities/session` → PROFILE_CATEGORIES). Группы происшествий — дословно
 * из classifier.json (entries[].group), службы-получатели — id из reference.json (services[].id).
 */

/** Строка привязки «служба/учебная группа курсантов → профильные группы ЕКП». */
export type ProfileMappingSeedRow = {
  id: string;
  /** User.service курсанта. */
  profile: string;
  /** Учебная группа (User.group), если профиль закреплён за одной группой. */
  groupName?: string;
  incidentGroups: string[];
  /** ServiceRef.id служб-получателей. */
  serviceIds: string[];
};

export const PROFILE_MAPPING_SEED: readonly ProfileMappingSeedRow[] = [
  {
    id: "dds-chert",
    profile: "ДДС района Чертаново Южное",
    groupName: "ДДС-01",
    incidentGroups: [
      "Дерево",
      "Провал грунта яма",
      "Снег грязь мусор тротуарная плитка",
      "пожар в жилом доме",
    ],
    serviceIds: ["svc-upr-chert", "svc-dds-chert", "svc-gkh"],
  },
  {
    id: "dds-zyuzino",
    profile: "ДДС района Зюзино",
    groupName: "ДДС-01",
    incidentGroups: ["Дерево", "Провал грунта яма", "пожар на улице"],
    serviceIds: ["svc-upr-zyuzino"],
  },
  {
    id: "mosvodokanal",
    profile: "Мосводоканал (учебный профиль)",
    incidentGroups: [
      "Аварии в городском хозяйстве - прорыв воды",
      "Качество воды, нет воды, канализация",
      "Скопление воды Подтопление Паводок",
    ],
    serviceIds: ["svc-mvk", "svc-moek"],
  },
  {
    id: "mosgaz",
    profile: "Мосгаз (учебный профиль)",
    incidentGroups: [
      "Запах газа в помещении (в доме, в квартире)",
      "Запах газа на улице (вне помещения)",
      "Повреждение газопровода",
      "Нарушения в работе газового оборудования",
    ],
    serviceIds: ["svc-104"],
  },
  {
    id: "moskollector",
    profile: "Москоллектор (пример для ролевой модели)",
    incidentGroups: ["Колодец люк повреждение", "Провал грунта яма"],
    serviceIds: ["svc-moskollector"],
  },
  /*
   * Профиль демо-путя защиты (spec/000-фронт/06-user-flows.md «Демо-путь для защиты», шаги 2–4): категории
   * [ДТП, Горхоз] у курсанта ДДС района Обручевский. Без этой строки в ленту курсанта попадала вся
   * тройка билета 32 (c-094, c-095, c-096) и первой выдавалась c-094 — демо-путь начинался не с c-095.
   */
  {
    id: "dds-obruchev",
    profile: "ДДС района Обручевский",
    groupName: "ДДС-02",
    incidentGroups: ["Дорожно-транспортные происшествия с пострадавшими", "Провода электрические"],
    serviceIds: ["svc-upr-obruchev"],
  },
];
