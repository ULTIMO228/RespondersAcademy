# Quickstart: офлайн-установка и демо-путь

Корень репозитория: `case-09-112-dispatcher-simulator-team-82/`.

## 1. Подготовка на машине с интернетом (один раз)

```bash
# Python-зависимости (uv) и Node
uv sync --all-packages
cd frontend && npm ci && npm run build && cd ..

# Модели: rubert-tiny2, multilingual-e5-small, vosk-small-ru, silero-tts, словари symspell, LLM для Ollama
./deploy/prepare-models.sh        # Windows: deploy\prepare-models.ps1
# результат: models/ (~1 ГБ без LLM) + ollama pull qwen2.5:7b-instruct-q4_K_M (~4,7 ГБ)

# Справочники и демо-данные
./deploy/seed-demo.sh             # импорт ЕКП (data/classifier), билетов (data/tickets), улиц (data/streets), демо-пользователи, синтетика
```

Скопировать репозиторий вместе с `models/` и (для Linux) экспортированными образами `docker save` на целевую машину.

## 2. Запуск в изолированной сети

**Linux (Docker Compose)**

```bash
docker compose -f deploy/docker-compose.yml up -d
# http://<host>:8080 — фронтенд; http://<host>:8080/api/docs — OpenAPI
```

**Windows без Docker**

```powershell
# PostgreSQL 14 установлен локально, создана БД dds_sim
$env:DATABASE_URL = "postgresql://dds:dds@localhost:5432/dds_sim"
uv run alembic -c backend/alembic.ini upgrade head
uv run uvicorn app.main:app --app-dir backend/src --host 0.0.0.0 --port 8000
# фронтенд: раздаётся бэкендом из frontend/dist
```

Проверка офлайна (SC-008): отключить сеть/включить захват трафика, пройти демо-путь — исходящих запросов за пределы localhost/локального сегмента быть не должно.

## 3. Демо-учётные записи (создаёт seed-demo)

| Логин | Пароль | Роль |
|---|---|---|
| admin | admin | администратор |
| teacher | teacher | преподаватель |
| student1 / student2 | student | обучающиеся, служба GKH, группа «Группа 1» |

## 4. Демо-путь (≤ 5 минут, порядок для скринкаста)

1. **Администратор** → Пользователи: показать роли и группу; Система: статус моделей «загружены».
2. **Преподаватель** → Банк сценариев: 96 билетов импортированы; «Генерировать» → категория 13 «Запах газа», сложность 3, 5 шт. → предпросмотр с эталоном; один отклонить с комментарием «укажите этаж» → перегенерация; два утвердить.
3. **Преподаватель** → Новое занятие: группа «Группа 1», режим «Карточки», категории 13 + 14, служба GKH, темп 1 карточка/мин, нормативы по умолчанию → Старт.
4. **Обучающийся 1** (второе окно/браузер): очередь → открыть карточку → «Принята» за 30 с → софтфон: набрать 101 → «Слушаю» → доклад → «Принято» → статусы до «Работы завершены». Параллельно приходит вторая карточка — переключиться.
5. **Преподаватель** → Мониторинг: оба обучаемых, таймеры, «Подкинуть дубль» обучаемому 2.
6. **Преподаватель** → Завершить → Отчёт: таблица по обучаемым, диаграммы, экспорт CSV/PDF; открыть разбор попытки (таймлайн, ошибки с правилами), изменить оценку с комментарием → аудит.
7. **Преподаватель** → Аналитика: радар, тепловая карта, топ ошибок, инсайт; **Обучающийся** → Мой прогресс: рекомендации, рейтинг.

## 5. Проверка качества (для документации «методы обработки данных»)

```bash
uv run pytest backend ml ai                      # юнит/интеграционные/контрактные тесты
uv run python ml/scripts/eval_classifier.py      # SC-003: accuracy по 96 билетам
uv run python ml/scripts/eval_assessor.py        # SC-002: согласие с разметкой, каппа, корреляция
uv run python ml/scripts/eval_report_checklist.py# SC-009
uv run python scripts/check-contracts.py         # Pydantic ⇄ JSON Schema ⇄ TS
```

## 6. Резервная копия

```bash
./deploy/backup.sh   # pg_dump → var/backups/<timestamp>.sql.gz; также кнопка в разделе «Администратор → Система»
```
