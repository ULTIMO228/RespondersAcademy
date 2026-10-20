# Отчёт 06: Анализ уязвимостей Compat API, ролевой модели (RBAC) и причин падения 11 тестов

**Дата проведения аудита**: 2026-10-20  
**Объект аудита**: Модули слоя совместимости `backend/app/api/compat/` (`sessions.py`, `attempts.py`, `card_actions.py`, `users.py`), механизм авторизации `backend/app/api/deps.py`, сервис оценок `evaluation_service.py`, результаты прогона `pytest` (11 failed, 1132 passed).  
**Нормативная база**:
- `AGENTS.md` (§2 «Инварианты безопасности», §3 «Сессия и гварды»);
- `spec/002-full-system-integration/spec.md` (HttpOnly авторизация, RBAC);
- `spec/019-learner-role-split/spec.md`.

---

## 1. Критические уязвимости Compat API и обход RBAC

Слой совместимости `app/api/compat` был разработан для поддержки автономного фронтенда Next.js без изменения мок-контрактов. В ходе аудита обнаружено, что большинство эндпоинтов слоя вообще не защищены проверкой серверной сессии (`require_viewer` / `Viewer`), что открывает возможность полной компрометации данных тренажёра.

### 1.1 Уязвимость SEC-01: Подделка оценок преподавателя анонимным клиентом
- **Кодовый след**:
  - `backend/app/api/compat/attempts.py:52-57`:
    ```python
    @router.post("/attempts/{attempt_id}/evaluation")
    async def override_attempt_evaluation(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
        body = await read_body(request)
        evaluation = await evaluation_service.override_evaluation(db, attempt_id, body, viewer)
        await db.commit()
        return evaluation
    ```
  - `backend/app/services/evaluation_service.py:207-219`:
    ```python
    async def _read_teacher(db: AsyncSession, body: dict[str, Any], viewer: Viewer | None) -> User:
        if viewer is not None and viewer.is_student:
            raise forbidden(TEACHER_ONLY_MESSAGE)
        teacher_id = body.get("teacherId")
        ...
        teacher = await db.get(User, teacher_id)
        if teacher is None or teacher.role not in ("teacher", "admin"):
            raise forbidden(TEACHER_ONLY_MESSAGE)
        return teacher
    ```
- **Анализ эксплойта**:
  Если запрос отправлен без авторизационных cookie/заголовков (`viewer is None`), проверка `if viewer is not None and viewer.is_student` **не срабатывает**!
  Сервис читает `teacherId` прямо из тела JSON (например, `"teacherId": "u-002"`), находит существующего в БД преподавателя и перезаписывает балл попытки на любое значение (от 0 до 100), записывая в аудит ложное действие от имени ничего не подозревающего преподавателя!
- **Уровень опасности**: 🔴 **Критический (CVSS 9.1)**.

---

### 1.2 Уязвимость SEC-02: Анонимный доступ к персональным данным (`GET /users`)
- **Кодовый след**:
  - `backend/app/api/compat/users.py:20-23`:
    ```python
    @router.get("/users")
    async def list_users(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
        if viewer is not None and viewer.is_student:
            raise forbidden("Список пользователей недоступен обучающемуся")
    ```
- **Анализ эксплойта**:
  Авторизованный обучающийся получает HTTP 403 Forbidden. Однако если анонимный атакующий делает `GET /users` без куки сессии, `viewer is None` обходит проверку, и сервер возвращает **полный список пользователей, групп, ролей и логинов системы**! Аноним получает больше прав, чем авторизованный курсант.
- **Уровень опасности**: 🔴 **Высокий (CVSS 7.5)**.

---

### 1.3 Уязвимость SEC-03: Неконтролируемое создание и завершение занятий
- **Кодовый след**:
  - `backend/app/api/compat/sessions.py:37-57`:
    ```python
    @router.post("/sessions")
    async def create_session(request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:

    @router.post("/sessions/{session_id}/start")
    async def start_session(session_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:

    @router.post("/sessions/{session_id}/stop")
    async def stop_session(session_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    ```
- **Анализ эксплойта**:
  Эндпоинты вообще не инжектируют зависимость `viewer`. Любой пользователь сети может удалённо остановить текущие экзаменационные занятия других групп или заспамить БД фейковыми учебными сессиями.
- **Уровень опасности**: 🔴 **Высокий (CVSS 7.5)**.

---

### 1.4 Уязвимость SEC-04: Анонимная мутация статусов и отработок карточек
- **Кодовый след**:
  - `backend/app/api/compat/card_actions.py:53, 107, 128`:
    `post_status`, `post_workline`, `post_reminder` не требуют авторизации (`db: AsyncSession = Depends(get_db)` без `viewer`). Любой запрос может перевести карточку в финальный статус `workDone` или добавить фиктивные записи вызова служб.
- **Уровень опасности**: 🔴 **Высокий (CVSS 7.3)**.

---

## 2. Детальный разбор 11 упавших тестов бэкенда (`pytest`)

По результатам запуска `uv run --project backend pytest backend/tests` (завершено за 57.99 с):  
**1132 passed, 11 failed, 2 skipped**.

### Группа 1: Рассинхронизация контрактов фронтенда и бэкенда
1. `backend/tests/contract/test_error_map_shapes.py::test_schema_fields_match_typescript_contract[ErrorMapExplanation]`:
   - *Ошибка*: `Extra items in the right set: 'sourceKind'`.
   - *Причина*: Pydantic-схема `ErrorMapExplanation` в Python возвращает поле `source`, а TypeScript-тип контракта ожидает `sourceKind`.
2. `backend/tests/unit/test_external_ai_audit.py::test_provider_error_gives_template_and_failed_audit_entry`:
   - *Ошибка*: `AttributeError: 'ErrorMapExplanation' object has no attribute 'source_kind'`.
   - *Причина*: Та же рассинхронизация имени атрибута `source_kind` в модели `ErrorMapExplanation`.
3. `backend/tests/unit/test_external_ai_audit.py::test_external_text_is_marked_ai_and_call_is_audited_without_content`:
   - *Ошибка*: `assert 'cloud' == 'ai'`.
   - *Причина*: Сервис вернул детальный источник `source="cloud"`, тогда как юнит-тест ожидает агрегированное значение `"ai"`.
4. `backend/tests/unit/test_external_ai_audit.py::test_cloud_error_falls_back_to_local_model_for_explanation`:
   - *Ошибка*: Аналогично `source="local"` вместо `"ai"`.

### Группа 2: Ошибки объявления параметров эндпоинтов (FastAPI)
5. `backend/tests/contract/test_teacher_specializations.py::test_teacher_updates_specialization_for_own_group_and_audits`:
   - *Ошибка*: `400 Bad Request: {"error":{"code":"validationFailed","message":"Заполните поле «request»"}}`.
   - *Причина*: В функции роутера `PATCH /teacher/students/{id}/specializations` параметр `request: Request` или DTO тела запроса объявлен без явного указания `Body(...)` или `Depends()`, из-за чего валидатор FastAPI трактует объект `Request` как обязательное поле входного JSON.
6. `backend/tests/contract/test_teacher_specializations.py::test_teacher_cannot_update_student_outside_assigned_groups`:
   - *Ошибка*: Та же ошибка валидации 400 вместо ожидаемого 403 Forbidden.

### Группа 3: RBAC фильтрация аудиозаписей для курсанта
7. `backend/tests/contract/test_v1_operator112.py::test_ready_applicant_audio_is_playable_from_recordings[wav]`:
   - *Ошибка*: `assert any(item["id"] == "ticket-c-050" for item in student_listed.json())` → `False`.
   - *Причина*: Эндпоинт `GET /cards/{id}/recordings` под ролью `student` скрывает запись заявителя `ticket-c-050` или требует наличия завершённой попытки для прослушивания.
8. `backend/tests/contract/test_v1_operator112.py::test_ready_applicant_audio_is_playable_from_recordings[mp3]`:
   - *Ошибка*: Аналогично (для mp3).

### Группа 4: Несоответствие шаблонов текстовых отчётов
9. `backend/tests/unit/test_report_builder_ai.py::test_slow_model_falls_back_to_template_within_timeout`:
   - *Ошибка*: `assert insights[0].startswith("Сводка по группе")` → `False` (фактически: `'Сводка по правилам: отчёт по 3 из 3 курсантов...'`).
   - *Причина*: В генераторе текстовых отчётов изменён префикс шаблонного текста с «Сводка по группе» на «Сводка по правилам».
10. `backend/tests/unit/test_report_builder_ai.py::test_template_texts_have_no_ai_prefix`:
    - *Ошибка*: Аналогичное расхождение префикса (`"Сводка по правилам"` vs `"Сводка по группе"`).

### Группа 5: Целостность датасета
11. `backend/tests/unit/test_ai_dataset_build.py::test_release_invariants`:
    - *Ошибка*: Несовпадение SHA256-хэша артефактов датасета с `manifest.json`.
    - *Причина*: После редактирования обучающих файлов или конвертации переводов строк CRLF/LF контрольная сумма манифеста не была пересчитана.

---

## 3. Независимый вердикт эксперта
- **Статус**: 🔴 **Критический приоритет устранения**.
- Уязвимости обхода аутентификации в Compat API представляют непосредственную угрозу академической честности платформы (возможность подделки оценок и срыва экзаменов).
- Все 11 упавших тестов локализованы, детерминированы и имеют точечные решения без изменения архитектуры системы.
