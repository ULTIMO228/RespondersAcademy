# Tasks: План задач по устранению дефектов полного цикла (Feature 008)

**Feature Branch**: `008-full-cycle-review`  
**Spec**: [`spec.md`](spec.md) | **Plan**: [`plan.md`](plan.md)  
**Status**: Ready for execution

---

## Фаза 1: Устранение критических уязвимостей безопасности (P0)

- [ ] **T001** [US3] Защитить эндпоинты правки оценок от анонимного доступа:
  - Файлы: `backend/app/api/compat/attempts.py:52-57`, `backend/app/services/evaluation_service.py:207-219`.
  - Требование: Заменить `viewer: Viewer | None` на `require_viewer`. В `_read_teacher` запретить выполнение, если `viewer.role != "admin"` и `viewer.user_id != teacher_id`.
  - Критерий: Анонимный вызов `POST /attempts/{id}/evaluation` возвращает 401 Unauthorized; курсант получает 403 Forbidden.

- [ ] **T002** [US3] Устранить утечку пользователей в `GET /users`:
  - Файлы: `backend/app/api/compat/users.py:20-23`.
  - Требование: Внедрить `require_role("teacher", "admin")`.
  - Критерий: Анонимный вызов `GET /users` возвращает 401 Unauthorized.

- [ ] **T003** [US3] Закрыть анонимное управление занятиями и статусами карточек:
  - Файлы: `backend/app/api/compat/sessions.py:37-57`, `backend/app/api/compat/card_actions.py:53-77`.
  - Требование: Добавить `require_viewer` и ролевые ограничения на `POST /sessions*` и `POST /cards/{id}/status`.
  - Критерий: Анонимные запросы отклоняются со статусом 401.

---

## Фаза 2: Восстановление сквозного сценария A → B и интеграции заданий (P0)

- [ ] **T004** [US2] Устранить 409 Conflict при валидации адреса в цепочке A → B:
  - Файлы: `backend/ml/generate/validator.py:255-264`, `backend/app/services/ai_scenario_service.py:712-743`.
  - Требование: Для версий сценария типа `student_card` проверять адрес по общему реестру улиц Москвы через `address_nlp.match(address).exact`, не требуя строгого вхождения в 14 адресов `address_allowlist`.
  - Критерий: Любой валидный московский адрес, введенный курсантом, получает статус `validation="passed"` и успешно утверждается преподавателем.

- [ ] **T005** [US2] Синхронизировать `scenario_ids` в `TrainingSession` при старте задания:
  - Файлы: `backend/app/services/assignment_service.py:254`.
  - Требование: Заполнять поле `scenario_ids` идентификаторами сценариев из задания вместо пустого списка `[]`.
  - Критерий: На экране эмулятора АРМ (`/arm`) блок «Мои назначенные модули» корректно выводит назначенные билеты вместо «Назначенных модулей нет».

---

## Фаза 3: Исправление 11 упавших тестов бэкенда (P1)

- [ ] **T006** [US4] Согласовать контракт `ErrorMapExplanation` между Python и TypeScript:
  - Файлы: `backend/app/schemas/error_map.py`, `backend/tests/contract/test_error_map_shapes.py:47`.
  - Требование: Добавить поле/алиас `sourceKind` и свойство `source_kind` в Pydantic-модель `ErrorMapExplanation`.
  - Критерий: `test_schema_fields_match_typescript_contract[ErrorMapExplanation]` проходит успешно.

- [ ] **T007** [US4] Исправить роут обновления специализаций преподавателем:
  - Файлы: `backend/app/api/v1/teacher.py`, `backend/tests/contract/test_teacher_specializations.py:43,54`.
  - Требование: Явно аннотировать тело запроса в `PATCH /teacher/students/{id}/specializations` (`Body(...)`).
  - Критерий: Тесты `test_teacher_updates_specialization_for_own_group_and_audits` и `test_teacher_cannot_update_student_outside_assigned_groups` проходят без ошибки 400.

- [ ] **T008** [US4] Открыть доступ курсанта к аудиозаписи заявителя в карточке:
  - Файлы: `backend/app/api/compat/card_actions.py` / `tickets.py`, `backend/tests/contract/test_v1_operator112.py:133`.
  - Требование: Разрешить роли `student` прослушивание записи заявителя `ticket-{card_id}`.
  - Критерий: Параметризованный тест `test_ready_applicant_audio_is_playable_from_recordings` (wav, mp3) проходит успешно.

- [ ] **T009** [US4] Согласовать источники ИИ и префиксы текстовых сводок:
  - Файлы: `backend/app/services/report_builder.py`, `backend/tests/unit/test_external_ai_audit.py`, `backend/tests/unit/test_report_builder_ai.py`.
  - Требование: Вернуть префикс шаблона `"Сводка по группе"` и нормализовать значение `source="ai"`.
  - Критерий: 5 тестов аудита ИИ и генератора сводок проходят успешно.

- [ ] **T010** [US4] Обновить хэши манифеста датасета:
  - Файлы: `backend/data/ai_dataset/manifest.json`, `backend/tests/unit/test_ai_dataset_build.py:276`.
  - Требование: Пересчитать SHA256 файлов датасета с нормализацией переводов строк LF.
  - Критерий: `test_release_invariants` проходит успешно. Полный запуск `pytest` выдаёт `1145 passed, 0 failed`.

---

## Фаза 4: Доработка доменной точности и аутентичности интерфейса (P2)

- [ ] **T011** [US1] Реализовать горячие клавиши рабочего места Специалиста-112:
  - Файлы: `src/pages/operator112/model/useOperator112Hotkeys.ts`, `src/pages/operator112/ui/Operator112Workspace.tsx`.
  - Требование: Добавить обработку `Alt+S` (Передать карточку), `Alt+A` (Адрес), `Alt+T` (Что случилось), `Alt+Q` (Заявитель), `Alt+O` (Описание).
  - Критерий: Нажатие комбинаций переносит фокус в соответствующие поля ввода.

- [ ] **T012** [US1] Добавить индикатор передачи первых 100 символов описания для службы 03:
  - Файлы: `src/pages/operator112/ui/Operator112Workspace.tsx`, `src/features/operator112-questionnaire/ui/Operator112Questionnaire.tsx`.
  - Требование: При наличии службы «03» / «103» в списке оповещения отображать предупреждение оператору и визуальный маркер 100 символов.
  - Критерий: При выборе медицинской карты в форме описания появляется плашка с пояснением регламента.

- [ ] **T013** [US1] Синхронизировать формулировку подсказки адреса с полями формы:
  - Файлы: `backend/app/services/operator112_service.py:51`.
  - Требование: Изменить текст шага `address` на формулировку, соответствующую фактическим полям («улица по справочнику, дом, район, округ»).
  - Критерий: Подсказка не требует от студента ввода несуществующих полей («корпус», «подъезд»).

- [ ] **T014** [US1] Добавить фильтрацию по ЧС и пострадавшим в журнал происшествий:
  - Файлы: `backend/app/services/cards_query.py:23-24,88-117`.
  - Требование: Поддержать query-параметры `chs` / `isEmergency` и `hasCasualties` в `GET /cards`.
  - Критерий: Фильтрация по ЧС и пострадавшим корректно сужает выборку карточек.

---

## Верификационный чек-лист сдачи
- [ ] Все 14 задач закрыты.
- [ ] `uv run --project backend pytest backend/tests` — 1145 passed, 0 failed.
- [ ] `npm run check` — 0 errors.
- [ ] `npm run test` — 1912 passed, 0 failed.
- [ ] Сквозной тест `e2e/two-mode-full-path.spec.ts` проходит со стендом без искусственного `E2E_CHAIN_ADDRESS`.
