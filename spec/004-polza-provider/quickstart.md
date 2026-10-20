# 004 — ручная проверка с реальным ключом Polza.ai (T007)

Критерий приёмки 5 (`spec.md` §6): с реальным ключом генерация сценария через Polza возвращает валидный сценарий. Дополнительно проверяются пояснение карты ошибок, аудит `ai.external_call` и отсутствие ключа в ответах и логах.

## Предусловия

- Ключ кладёт владелец в `backend/.env` (агент файл не читает и не печатает):
  ```
  AI_PROVIDER=polza
  POLZA_API_KEY=<ключ>
  POLZA_MODEL=<ID модели с открытыми весами по каталогу Polza>  # обязательна: значения по умолчанию нет (поправка 2026-10-19)
  ```
- Сеть до `polza.ai` открыта (в облачном контейнере — домен в Allowed domains окружения).
- Отдельная база, чтобы не трогать `dev.db`/`demo.db`:
  ```bash
  cd backend
  export DATABASE_URL=sqlite+aiosqlite:///./var/polza-check.db ML_WARMUP=0
  uv run python -m app.seed.load --reset
  uv run python scripts/seed_error_map_demo.py
  uv run uvicorn app.main:app --port 8000
  ```

## Шаги

```bash
B=http://localhost:8000/api/v1
curl -s -c t.jar -H 'Content-Type: application/json' -d '{"login":"morozova","password":"teacher112"}' $B/auth/login >/dev/null
curl -s -c a.jar -H 'Content-Type: application/json' -d '{"login":"admin","password":"admin112"}' $B/auth/login >/dev/null
```

1. Статус провайдера (admin): `curl -s -b a.jar $B/admin/ai/provider` → `provider: "polza"`, `configured: true`, `withinLimits: true`, ключа в ответе нет.
2. Генерация сценария (teacher):
   `curl -s -b t.jar -H 'Content-Type: application/json' -d '{"category":"пожар в жилом доме","requestedBy":"u-002"}' $B/scenarios/generate`
   → 201; у сценариев `generation.provider` начинается с `polza:`; отчёт валидатора без ошибок.
3. Пояснение карты ошибок (teacher morozova, демо-группа из `seed_error_map_demo.py`):
   `curl -s -b t.jar "$B/error-map/groups/ДДС-Демо-1/stages/card?mode=dds&period=all"` (группу URL-кодировать)
   → в пояснении `source: "ai"`, текст 1–2 фразы на русском, без имён обучающихся.
4. Аудит (admin): `curl -s -b a.jar "$B/admin/audit"` → записи «Обращение к внешней модели» (`ai.external_call`): «Внешняя модель polza:…: генерация сценария / пояснение карты ошибок; запрос N зн.; результат ok»; текстов запроса и ключа в записях нет. `source: "template"` в шаге 3 или `provider: "template"` в шаге 2 при записи с ошибкой — внешний вызов не удался.
5. Утечка ключа: `grep -rF "<ключ>" backend/var/ <лог uvicorn>` → пусто (команду запускает владелец — ключ знает только он).
6. Откат: убрать `AI_PROVIDER=polza` из `backend/.env`, перезапустить; `GET /admin/ai/provider` → `provider: "local"`, `configured: false`.

## Протокол

| Дата | Модель | Шаг | Результат | Кто |
|---|---|---|---|---|
| 2026-10-20 | — | 1–6 | **не проверялось**: в облачном контейнере нет `backend/.env`/`POLZA_API_KEY`, а сетевая политика окружения отвечает 403 на `https://polza.ai/` | агент |
