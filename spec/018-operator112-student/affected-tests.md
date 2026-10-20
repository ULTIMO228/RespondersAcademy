# Тесты, затронутые сменой профиля ivanov (spec/018)

Найдены прогоном полного набора после реализации (2026-10-20), а не grep-ом: из ~44 файлов, где ivanov упоминается рядом с ДДС, реально упали 15 тестов — остальные используют ivanov только в мок-данных.

## pytest (10)

| Тест | Причина | Что сделано |
|---|---|---|
| `integration/test_alembic.py::test_initial_migration_and_seed_on_clean_database` | head теперь `0006_user_training_profile` | ожидание обновлено + проверка профиля ivanov после сида |
| `contract/test_calls.py::test_card_call_recorded_and_report_checked` | карточка ДДС у ivanov | курсант → petrova (`student2`) |
| `contract/test_scenarios.py::test_validation_workflow` | профиль проверялся раньше «не утверждён» | **код**: проверка профиля в `create_session` перенесена после проверок сценариев |
| `contract/test_sessions.py::test_student_journey` | занятие ДДС у ivanov | → petrova, «чужой» — sidorova |
| `contract/test_sessions.py::test_session_validation_and_feed_access` | занятие ДДС с ivanov | → petrova + alekseeva (та же служба) |
| `contract/test_v1_lobby.py::test_own_lobby_history_and_analytics` | у ivanov в сидах только попытки ДДС → история пуста | → petrova, «чужой» — ivanov |
| `contract/test_v1_rbac.py::test_student_cannot_read_messages_or_send_report_for_another_dds_attempt` | задание ДДС ivanov | владелец petrova, «чужой» sidorova (`student3`) |
| `integration/test_chain.py::test_teacher_can_issue_source_based_trap` | занятие ДДС ivanov | → petrova |
| `integration/test_exam_flow.py::test_dds_exam_timeout_and_no_repeat` | экзамен ДДС ivanov | → petrova + alekseeva |
| `integration/test_exam_flow.py::test_dds_exam_score_sets_passed` | экзамен ДДС ivanov | → petrova |

## vitest (5)

| Тест | Причина | Что сделано |
|---|---|---|
| `shared/api/mock/routes/admin.test.ts` «пароль не утекает» | регулярка `112"` ловила значение `"operator112"` | регулярка сужена до паролей `"(admin\|teacher\|student)112"` |
| `shared/api/mock/session-plan.test.ts` «Мосгаз…» и профильный фильтр | курсант Чертаново = ivanov | `FIRE_STUDENT` → petrova |
| `shared/api/mock/session-plan.test.ts` «сильному курсанту…» | сильный курсант с баллами 98/95 — только ivanov, у него больше нет фильтра службы | остаётся ivanov; проверяется порядок (сложные → простые), а не точный состав |
| `widgets/incident-list/ui/IncidentJournal.session.test.tsx` (2) | журнал ДДС под ivanov | профильные тесты ленты — под petrova |

## e2e-скрипты (не запускались, только синтаксис `bash -n`)

- `scripts/e2e-student.sh`: курсант по умолчанию petrova / АРМ 2, «чужой» — ivanov (у него есть попытки в сидах).
- `scripts/e2e-teacher.sh`: курсант по умолчанию petrova (`u-006`), АРМ 2.
