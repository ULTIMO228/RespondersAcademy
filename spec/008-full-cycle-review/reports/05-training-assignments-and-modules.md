# Отчёт 05: Учебные задания, модули и сквозная цепочка A → B

**Дата проведения аудита**: 2026-10-20  
**Объект аудита**: Модули заданий `src/widgets/incident-list/` (`AssignedModules.tsx`, `modules.ts`), сервисы бэкенда `backend/app/services/assignment_service.py`, `backend/app/services/ai_scenario_service.py`, `backend/app/services/ai_scenario_review.py`, фикстура `backend/scripts/seed_chain_demo.py`.  
**Нормативная база**:
- `spec/002-full-system-integration/spec.md` (сквозная цепочка 112 → ДДС);
- `spec/019-learner-role-split/spec.md` (разграничение заданий);
- `hack/Фронт/ФРОНТ-АРМ-112-ЕДИНЫЙ-ДОКУМЕНТ.md` (ТЗ §8).

---

## 1. Архитектурная коллизия: две параллельные системы заданий

В репозитории сосуществуют два несинхронизированных механизма выдачи учебных материалов:
1. **Современная система заданий платформы (`Assignment`)**:
   - Живёт в платформе-обложке: `/student/assignments` и `/teacher/assignments`;
   - Поддерживает режимы `dds`, `operator112`, `chain`;
   - Хранит привязку к билетам, версиям сценариев и формату (`training` / `exam`).
2. **Устаревший блок «Мои назначенные модули» на экране эмулятора АРМ (`/arm`)**:
   - Виджет `AssignedModules.tsx` отображает плашку «Мои назначенные модули» над журналом;
   - Запрашивает `GET /sessions?studentId=...` и `GET /scenarios?validationStatus=approved`;
   - Собирает список модулей по пересечению `session.scenarioIds` и утверждённых сценариев.

---

## 2. Критический дефект 05-A: Пустые `scenario_ids` и надпись «Назначенных модулей нет»

### 2.1 Кодовый след
- В `backend/app/services/assignment_service.py:254`:
  ```python
  session = TrainingSession(
      id=await next_id(db, PREFIX["session"], TrainingSession.id),
      teacher_id=row.teacher_id,
      student_ids=[student_id],
      scenario_ids=[],  # <--- КРИТИЧЕСКИЙ ДЕФЕКТ: ВСЕГДА ПУСТОЙ СПИСОК
      mode=f"assignment:{row.id}",
      card_source="generated",
      card_flow=[],
      state="running",
      started_at=now_iso(),
      plan=row.params,
      paused_at=None,
      parked=[],
      training_mode="dds",
      format=row.format,
      exam={"passThreshold": (row.params or {}).get("passThreshold")} if row.format == "exam" else None
  )
  ```
- В `src/widgets/incident-list/lib/modules.ts:70-76`:
  ```typescript
  sessions
    .filter((session) => ASSIGNED_SESSION_STATES.has(session.state) && session.studentIds.includes(studentId))
    .forEach((session) =>
      session.scenarioIds.forEach((scenarioId) => {  // session.scenarioIds всегда пуст!
        ...
      }),
    );
  ```
- В `src/widgets/incident-list/ui/AssignedModules.tsx:56-58`:
  ```tsx
  {status === "ready" && modules.length === 0 ? (
    <p className={styles.modules__empty}>Назначенных модулей нет</p>
  ) : null}
  ```

### 2.2 Последствия
Когда преподаватель назначает студенту задание через новый интерфейс `/teacher/assignments`, и студент запускает его, в БД создаётся сессия с `scenario_ids=[]`. Переходя в эмулятор АРМ-112 (`/arm`), студент видит обескураживающее сообщение: **«Назначенных модулей нет»**.

### 2.3 Устранение
В `assignment_service.py` при создании `TrainingSession` заполнять `scenario_ids` списком ID сценариев, привязанных к `Assignment` (из `row.scenario_versions` или `card_ids`).

---

## 3. Критический дефект 05-B: 409 Conflict в сквозной цепочке A → B из-за коллизии справочников адресов

### 3.1 Механика воспроизведения
Сквозной сценарий A → B предполагает:
1. Студент в роли Специалиста-112 принимает звонок и вводит адрес происшествия;
2. Нажимает «Передать карточку» (`submit`);
3. Создаётся черновик карточки ДДС (`create_chain_dds_draft`), который преподаватель должен подтвердить перед входом студента в ДДС-этап;
4. Преподаватель отправляет `POST /ai/scenarios/{id}/approve` для утверждения.

### 3.2 Кодовый след блокировки
- В `src/features/operator112-address/ui/Operator112AddressField.tsx` автодополнение улиц ходит в справочник `moscow_streets.json`, насчитывающий более 4 000 улиц Москвы.
- В `backend/app/services/ai_scenario_service.py:712-743`:
  ```python
  address_rows = (await db.execute(select(Address).order_by(Address.id))).scalars().all()
  allowed_addresses = _address_allowlist([row.doc for row in address_rows])
  ...
  errors = validate_card_snapshot(dict(card), "dds", etalon, classifier_entries, await _profile_groups(db), allowed_addresses)
  ```
- Таблица `Address` заполняется из `mocks/local/addresses.json`, содержащего **всего 14 адресов**!
- В `backend/ml/generate/validator.py:258-263`:
  ```python
  if address_allowlist is not None and normalized_address not in address_allowlist:
      errors.append({"fieldPath": "address", "code": "address_not_in_directory", "message": f"Адрес «{address or 'не указан'}» не подтверждён локальным справочником"})
  ```
- Если студент ввёл адрес из справочника улиц Москвы, не входящий в эти 14 тестовых строк:
  `errors` не пуст → `dds_version.validation = "failed"` → `dds_version.approval = "validation_failed"`.
- При попытке утверждения преподавателем в `backend/app/services/ai_scenario_review.py:240-241`:
  ```python
  if version.validation != "passed":
      raise conflict("Нельзя утвердить сценарий до успешной структурной проверки")
  ```
- Сервер возвращает **HTTP 409 Conflict**, утверждение блокируется, и сквозная цепочка навсегда застревает на первом этапе!

### 3.3 Доказательство в коде e2e-теста
Разработчики обошли этот дефект в тесте костылём (`e2e/two-mode-full-path.spec.ts:47-52`):
```typescript
/* Вход ДДС принимает только адрес из локального справочника адресов: вводим его точно, как в карточке сценария. */
expect(process.env.E2E_CHAIN_ADDRESS, "нужен E2E_CHAIN_ADDRESS ...").toBeTruthy();
await page.getByLabel("Описательный адрес").fill(process.env.E2E_CHAIN_ADDRESS ?? "");
```
В реальном использовании живой человек не знает этот скрытый адрес из env-переменной и неизбежно получает тупиковый 409 Conflict.

### 3.4 Устранение
В `validator.py` для карточек, сформированных студентом (`source_kind == "student_card"`), проверять адрес по общему справочнику улиц Москвы (`address_nlp.match(address).exact`), либо расширить `allowed_addresses` всеми распознаваемыми адресами Москвы.

---

## 4. Независимый вердикт эксперта
- **Статус**: 🔴 **Блокирующий критический дефект**.
- Ошибка с адресом делает сквозную цепочку неработоспособной в 99.7% случаев ввода адреса пользователем.
- Ошибка с пустым `scenario_ids` ломает связь между платформой заданий и интерфейсом АРМ-112.
