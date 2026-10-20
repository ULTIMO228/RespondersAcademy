# Implementation Plan: Устранение выявленных дефектов полного цикла платформы (Feature 008)

**Feature Branch**: `008-full-cycle-review`  
**Base**: `main`  
**Dependencies**: `spec/008-full-cycle-review/spec.md`, отчёты аудита `reports/01-*.md`–`07-*.md`.

---

## 1. Архитектурная стратегия и приоритизация

Исследование полного цикла выявило 10 дефектов, распределённых по трём критическим направлениям:
1. **Информационная безопасность и RBAC**: брешь в слое совместимости `compat`, позволяющая анонимно подделывать оценки и управлять занятиями;
2. **Сквозная функциональность**: блокировка цепочки A → B из-за различия справочников адресов и скрытие назначенных модулей на `/arm`;
3. **Доменная аутентичность и тесты**: 11 упавших тестов, отсутствие хоткеев 112, несоответствие подсказки адреса форме ввода, отсутствие отсечки 100 символов для службы 03.

План выстроен по принципу: **сначала закрыть уязвимости и блокирующие ошибки, затем устранить регрессии тестов, после чего доработать аутентичность интерфейса**.

---

## 2. Фазы выполнения работ

### Фаза 1: Устранение критических уязвимостей безопасности в Compat API (P0)
- **Цель**: Полная изоляция ролей, предотвращение подделки оценок и несанкционированного доступа.
- **Шаги реализации**:
  1. `backend/app/api/compat/attempts.py`:
     - В `override_attempt_evaluation` внедрить зависимость `viewer: Viewer = Depends(require_viewer)`;
     - В `evaluation_service.py:_read_teacher`: если роль не `admin`, требовать `viewer.user_id == teacher_id` (преподаватель не может действовать от чужого имени).
     - В `open_card_attempt` и `attempt_progress`: требовать сессию курсанта или преподавателя, запретить анонимное открытие попыток.
  2. `backend/app/api/compat/users.py`:
     - Заменить мягкий гвард на `viewer: Viewer = Depends(require_role("teacher", "admin"))`. Неавторизованные запросы возвращают HTTP 401 Unauthorized.
  3. `backend/app/api/compat/sessions.py`:
     - Добавить проверку прав преподавателя/администратора на вызовы `POST /sessions`, `POST /sessions/{id}/start`, `POST /sessions/{id}/stop`.
  4. `backend/app/api/compat/card_actions.py`:
     - Защитить мутирующие эндпоинты `POST /status`, `POST /worklines`, `POST /reminders` требованием валидной сессии обучающегося или преподавателя.

### Фаза 2: Восстановление сквозного сценария A → B и интеграции заданий (P0)
- **Цель**: Беспрепятственное прохождение сквозной цепочки и отображение билетов на АРМ.
- **Шаги реализации**:
  1. `backend/app/services/assignment_service.py`:
     - В функции `start_assignment` (строка 254) при инициализации `TrainingSession` заполнять `scenario_ids`:
       извлекать ID сценариев из привязанных версий (`row.scenario_versions`) либо карточек (`row.card_ids`).
  2. `backend/ml/generate/validator.py`:
     - В `validate_ai_scenario` скорректировать проверку адреса: для версий сценария типа `student_card` проверять адрес через `address_nlp.match(address).exact` по полному реестру улиц Москвы, не требуя строгого вхождения в 14 адресов `address_allowlist`.
  3. `backend/app/services/ai_scenario_service.py`:
     - В `create_chain_dds_draft` передавать расширенный контекст валидации, гарантируя статус `validation="passed"` при вводе корректного московского адреса.

### Фаза 3: Исправление 11 упавших тестов бэкенда (P1)
- **Цель**: 100% зелёный прогон тестового набора (`1145 passed`).
- **Шаги реализации**:
  1. `backend/app/schemas/error_map.py`:
     - В модель `ErrorMapExplanation` добавить алиас `sourceKind` (и поле/property `source_kind`), возвращающее строковое значение для контракта TypeScript.
     - Согласовать ожидаемое тестом значение источника (`"ai"` вместо `"cloud"`/`"local"` при аудите внешних вызовов).
  2. `backend/app/api/v1/teacher.py`:
     - В роуте `PATCH /teacher/students/{student_id}/specializations` явно объявить параметр тела: `body: UpdateSpecializationsRequest = Body(...)`, устранив ошибку FastAPI `{"error": "Заполните поле «request»"}`.
  3. `backend/app/api/v1/tickets.py` / `cards.py`:
     - В эндпоинте `GET /cards/{card_id}/recordings` разрешить курсанту доступ к записи заявителя `ticket-{card_id}`.
  4. `backend/app/services/report_builder.py`:
     - Синхронизировать префикс текстового отчёта: вернуть константу `"Сводка по группе: ..."` в шаблоне отчёта.
  5. `backend/data/ai_dataset/`:
     - Пересчитать контрольные суммы SHA-256 артефактов датасета и обновить `manifest.json`.

### Фаза 4: Доработка доменной точности и аутентичности интерфейса (P2)
- **Цель**: Полное соответствие требованиям регламентов и памятки АРМ-112.
- **Шаги реализации**:
  1. `src/pages/operator112/ui/Operator112Workspace.tsx`:
     - Внедрить глобальный хук клавиатурных сокращений `useOperator112Hotkeys`:
       * `Alt+S` — передать карточку;
       * `Alt+A` — фокус в поле улицы;
       * `Alt+T` — фокус в селектор «Что случилось»;
       * `Alt+Q` — фокус в поле ФИО заявителя;
       * `Alt+O` — фокус в поле описания.
     - Добавить индикатор/подсказку: «В службу 03 передаются первые 100 символов описания» при наличии СМП в списке оповещения.
     - При превышении норматива обработки вешать класс `.work__bar--exceeded` на контейнер шапки.
  2. `backend/app/services/operator112_service.py`:
     - Синхронизировать формулировку подсказки шага `address` с доступными полями ввода формы.
  3. `backend/app/services/cards_query.py`:
     - Добавить параметры фильтрации `isEmergency` (ЧС) и `hasCasualties` (пострадавшие) в `GET /cards`.

---

## 3. Верификационный гейт

Перед завершением работ обязателен прогон гейтов:
1. `uv run --project backend pytest backend/tests` — 1145 passed, 0 failed;
2. `npm run check` — 0 ошибок lint, typecheck, steiger, build;
3. `npm run test` — 1912 passed, 0 failed;
4. Сквозной e2e-сценарий: `backend/scripts/run_frontend_e2e.sh --only chain`.
