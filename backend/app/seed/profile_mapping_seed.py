"""Копия PROFILE_MAPPING_SEED из src/shared/config/profileCategories.ts."""

PROFILE_MAPPING_SEED = [
    {
        "id": "dds-chert", "profile": "ДДС района Чертаново Южное", "group_name": "ДДС-01",
        "incident_groups": ["Дерево", "Провал грунта яма", "Снег грязь мусор тротуарная плитка", "пожар в жилом доме"],
        "service_ids": ["svc-upr-chert", "svc-dds-chert", "svc-gkh"],
    },
    {
        "id": "dds-zyuzino", "profile": "ДДС района Зюзино", "group_name": "ДДС-01",
        "incident_groups": ["Дерево", "Провал грунта яма", "пожар на улице"],
        "service_ids": ["svc-upr-zyuzino"],
    },
    {
        "id": "mosvodokanal", "profile": "Мосводоканал (учебный профиль)",
        "incident_groups": ["Аварии в городском хозяйстве - прорыв воды", "Качество воды, нет воды, канализация", "Скопление воды Подтопление Паводок"],
        "service_ids": ["svc-mvk", "svc-moek"],
    },
    {
        "id": "mosgaz", "profile": "Мосгаз (учебный профиль)",
        "incident_groups": ["Запах газа в помещении (в доме, в квартире)", "Запах газа на улице (вне помещения)", "Повреждение газопровода", "Нарушения в работе газового оборудования"],
        "service_ids": ["svc-104"],
    },
    {
        "id": "moskollector", "profile": "Москоллектор (пример для ролевой модели)",
        "incident_groups": ["Колодец люк повреждение", "Провал грунта яма"],
        "service_ids": ["svc-moskollector"],
    },
    {
        "id": "dds-obruchev", "profile": "ДДС района Обручевский", "group_name": "ДДС-02",
        "incident_groups": ["Дорожно-транспортные происшествия с пострадавшими", "Провода электрические"],
        "service_ids": ["svc-upr-obruchev"],
    },
]
