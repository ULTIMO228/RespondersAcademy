# Quickstart: проверка чата

Подготовка: `./scripts/demo-up.sh` (или `BACKEND_URL=http://localhost:8000 npm run dev`), вход обучающимся с завершённой попыткой.

1. Открыть `/student/results/<attemptId>?mode=operator112` → в шапке есть «Обсудить результат с ИИ»; в `/arm/*` и в `/teacher/*` её нет.
2. Нажать кнопку: шторка справа ≤ 250 мс, фокус в поле; Esc, ✕ и клик по фону закрывают.
3. Спросить «Почему снижен балл?» → ответ с бейджем источника, соответствующим `/account/ai` (local без ключа).
4. Enter отправляет, Shift+Enter — перенос; пустое поле — кнопка disabled; перетаскивание файла ничего не делает.
5. Отключить модель (остановить llama-server/без ключа) → ответ «шаблон» и подпись справочного режима.
6. Перезагрузить страницу, открыть шторку → переписка восстановлена; «Очистить» удаляет.
7. Чужой `attemptId` через curl → 403, несуществующий → 404, свой → 200.

Автотесты: `cd backend && uv run pytest -q tests -k attempt_chat && uv run ruff check .`; `npx vitest run src/widgets/attempt-chat src/pages/student/results`; `npm run check`.
