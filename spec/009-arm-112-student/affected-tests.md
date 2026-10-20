# Затронутые тесты и сценарии (009, T002)

Поиск 2026-10-20: `rg -l "Operator112Workspace|operator112-softphone|Operator112Softphone|Режим «Специалист-112»|Передать карточку|Ответить на вызов" src e2e scripts app`.

| Файл | Что завязано на старый вид | Что делать | Задача |
|---|---|---|---|
| `src/pages/operator112/ui/Operator112Screen.test.tsx` (14 тестов) | старая форма, «Ответить на вызов», «Передать карточку», текстовый софтфон | переписать под виды журнал → окно вызова → карточка → «сохранить» | T032 (вызов), T049 (сохранение), T050 (остаток) |
| `src/widgets/operator112-softphone/ui/Operator112Softphone.test.tsx` (14 тестов) | удаляемый виджет | удалить вместе с виджетом; поведение «повтор записи» покрывает тест `useApplicantVoice` (T020) | T050 |
| `src/app/layouts/simulatorBoundary.test.ts` | в списке слайсов симулятора есть `src/widgets/operator112-softphone` | заменить на новые слайсы 112 (`operator112-journal`, `operator112-card`, `features/operator112-*`) | T050 |
| `e2e/simulator-visual.spec.ts` | снимок `arm-operator112` (`/arm/operator112` без `assignmentId`) | эталон обновится намеренно: это экран 112, ДДС-снимки (`arm-journal`, `arm-card`, `arm-phone`) должны остаться прежними | T069 |
| `scripts/demo-video/record.mjs` | клики «Ответить на вызов», «Передать карточку» | обновить кнопки на «Принять», «сохранить» (скрипт записи демо, не тест; prettier-замечание у файла было до 009) | T050 |

Не тесты, но текст «Режим «Специалист-112»» остаётся корректным вне экрана АРМ (кабинет, результаты, матрица доступа, комментарии контракта): `StudentResultDetailScreen.tsx`, `roleAccess.ts`, `endpoints/operator112.ts`, `types/operator112.ts`. `Operator112Problem.tsx` (экран ошибки без задания) — заголовок убрать с экрана АРМ в T026 (FR-003).

**`scripts/e2e-student.sh`** шагов режима 112 не содержит (только ДДС у petrova и сессия), поэтому T051 сводится к проверке, что скрипт остаётся зелёным; HTTP-шаги 112 при желании — отдельной задачей.
