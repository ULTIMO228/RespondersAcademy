# Перечень использованных библиотек и компонентов

Артефакт сдачи по ТЗ §13 («Перечень всех использованных библиотек и компонентов»), задача `T5.3-02` / `T029`.
Источники — `package.json` (фронтенд) и `backend/pyproject.toml` (бэкенд). Версии — фактически зафиксированные в `package-lock.json` и `backend/uv.lock`.

> **Внешних CDN и сетевых вызовов в приложении нет.** Все ассеты — локальные: иконки АРМ-112 (`icons/` →
> `public/icons/`), шрифты — системные (`--font-ui: system-ui, Roboto, "Segoe UI", Arial`, `src/shared/ui/styles/vars.css` и `tokens-platform.css`),
> данные — локальные JSON из `mocks/` и локальная SQLite база данных `backend/var/`. Приложение обращается только к собственному шлюзу и бэкенду на том же origin.
> Проверено grep-аудитом `src/`, `app/`, `backend/app/` на `http(s)://` (SC-008, `docs/offline-check.md`):
> внешних URL в рантайм-коде и ассетах нет.

---

## 1. Зависимости фронтенда (`package.json`)

### Рантайм (`dependencies` — 3 пакета)

Попадают в production-сборку фронтенда. Новых пакетов в рамках фичи 002 не добавлялось.

| Пакет | Диапазон в `package.json` | Установленная версия | Лицензия | Назначение в проекте |
|---|---|---|---|---|
| `next` | `latest` | 16.3.5 | MIT | Фреймворк приложения: App Router (`app/`), Route Handlers (`app/api/mock/**`, `app/api/v1/ai/**`), proxy сессии (`proxy.ts`), сборка Turbopack. |
| `react` | `latest` | 19.3.0 | MIT | Библиотека компонентов: все экраны, виджеты и элементы интерфейса FSD-слоёв `src/**`. |
| `react-dom` | `latest` | 19.3.0 | MIT | Рендер React в DOM в браузере и на сервере (SSR). |

### Разработка (`devDependencies` — 18 пакетов)

В production-сборку не попадают.

| Пакет | Диапазон в `package.json` | Установленная версия | Лицензия | Назначение в проекте |
|---|---|---|---|---|
| `@feature-sliced/steiger-plugin` | `^0.7.0` | 0.7.0 | MIT | Правила Feature-Sliced Design для Steiger — гейт архитектуры `src/`. |
| `@playwright/test` | `^1.63.0` | 1.63.0 | Apache-2.0 | Браузерный e2e-раннер сквозных сценариев и визуальных регрессий. |
| `@testing-library/dom` | `^10.4.2` | 10.4.2 | MIT | Базовые запросы к DOM в компонентных тестах. |
| `@testing-library/jest-dom` | `^7.0.1` | 7.0.1 | MIT | Матчеры состояния DOM в тестах (`toBeInTheDocument`, `toBeDisabled`). |
| `@testing-library/react` | `^16.3.3` | 16.3.3 | MIT | Рендер и симуляция взаимодействия в тестах компонентов. |
| `@types/node` | `latest` | 26.6.1 | MIT | Типы Node.js для серверного кода и сборочных скриптов. |
| `@types/react` | `latest` | 19.3.0 | MIT | Типы React для TypeScript strict. |
| `@types/react-dom` | `latest` | 19.3.0 | MIT | Типы `react-dom` для TypeScript strict. |
| `@vitejs/plugin-react` | `^6.1.1` | 6.1.1 | MIT | JSX-трансформ для Vitest (`vitest.config.mts`). |
| `eslint` | `^9.39.5` | 9.39.5 | MIT | Статический анализатор кода (`npm run lint`). |
| `eslint-config-next` | `^16.3.5` | 16.3.5 | MIT | Правила ESLint для Next.js App Router. |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | MIT | Валидация хуков React (`rules-of-hooks`, `exhaustive-deps`). |
| `jsdom` | `^30.1.0` | 30.1.0 | MIT | DOM-окружение для Vitest без запуска браузера. |
| `prettier` | `^3.9.8` | 3.9.8 | MIT | Форматирование кода проекта (`npm run format:check`). |
| `steiger` | `^0.6.0` | 0.6.0 | MIT | FSD-линтер архитектурных слоёв `src/`. |
| `typescript` | `latest` | 5.9.3 | Apache-2.0 | Строгая статическая типизация (`npm run typecheck`). |
| `typescript-eslint` | `^8.70.0` | 8.70.0 | MIT | Парсер и правила ESLint для TypeScript. |
| `vitest` | `^5.0.1` | 5.0.1 | MIT | Высокоскоростной раннер юнит- и компонентных тестов (`npm run test`). |

---

## 2. Зависимости бэкенда (`backend/pyproject.toml`)

### Основной рантайм бэкенда

| Пакет | Версия в `pyproject.toml` | Лицензия | Назначение |
|---|---|---|---|
| `fastapi` | `>=0.115` | MIT | Веб-фреймворк REST API (`app/main.py`, роутеры `/api/v1/*` и compat). |
| `uvicorn[standard]` | `>=0.30` | BSD-3-Clause | Высокопроизводительный асинхронный ASGI веб-сервер. |
| `sqlalchemy[asyncio]` | `>=2.0.30` | MIT | Асинхронная ORM и абстракция базы данных (44 таблицы). |
| `aiosqlite` | `>=0.20` | MIT | Асинхронный драйвер SQLite для локальной разработки и демо-стенда. |
| `alembic` | `>=1.13` | MIT | Управление версиями схемы БД (`0001_initial` с защитными триггерами). |
| `pydantic` | `>=2.7` | MIT | Валидация входных/выходных контрактов (camelCase схемы 1:1 с фронтом). |
| `pydantic-settings` | `>=2.3` | MIT | Управление конфигурацией приложения из окружения. |
| `python-jose[cryptography]` | `>=3.3` | MIT | Выпуск и верификация JWT токенов сессий (HS256). |
| `argon2-cffi` | `>=23.1` | MIT | Криптографическое хеширование паролей пользователей. |
| `httpx` | `>=0.27` | BSD-3-Clause | Асинхронный HTTP-клиент для внутренних запросов и тестов. |
| `rapidfuzz` | `>=3.9` | MIT | Нечёткий поиск и сравнение строк при сопоставлении адресов/признаков. |
| `symspellpy` | `>=6.7` | MIT | Быстрая орфографическая коррекция ввода оператора. |
| `numpy` | `>=1.26` | BSD-3-Clause | Векторные операции и расчёт метрик оценщиков. |
| `scikit-learn` | `>=1.5` | BSD-3-Clause | Классификация групп ЕКП (логистическая регрессия). |
| `reportlab` | `>=4.2` | BSD-3-Clause | Серверная генерация PDF-отчётов занятий. |
| `python-multipart` | `>=0.0.9` | Apache-2.0 | Обработка загрузки аудио-докладов (multipart/form-data). |

### Опциональные и dev-зависимости бэкенда

- `pytest`, `pytest-asyncio`, `ruff` — линтинг и тестирование бэкенда (391 pytest).
- `jsonschema[format-nongpl]` — контрактные тесты JSON-схем без GPL-компонентов.
- `asyncpg` (extra `pg`) — опциональный драйвер PostgreSQL 12+.
- `torch`, `sentence-transformers`, `soundfile`, `vosk` (extras `nlp`, `tts`, `stt`) — опциональные локальные ML-модели; при их отсутствии включается аварийный режим.

---

## 3. Что написано без сторонних библиотек (осознанные решения)

В целях соблюдения автономности и минимизации зависимостей ключевые компоненты реализованы собственными средствами:

| Компонент | Чем сделано | Где находится |
|---|---|---|
| Графики успеваемости (столбцы, линии, динамика) | Собственные чистые SVG-примитивы без Chart.js | `src/shared/ui/charts`, `src/shared/ui/platform/NormChart.tsx` |
| Экспорт отчёта в CSV | Собственный сериализатор с экранированием и UTF-8 BOM | `src/features/report-export/lib/csv.ts` |
| Генерация PDF-сертификата | Векторная отрисовка в canvas → минимальный PDF 1.4 | `src/features/report-export/lib/certificate-pdf.ts` |
| Аудио-рекордер для доклада | Web Audio API / MediaRecorder → PCM 16 кГц 16 бит моно | `src/shared/lib/audio-recorder/` |
| Инструмент валидации моков | Python 3 (стандартные библиотеки `json`, `re`, `sys`) | `spec/000-фронт/mocks/_tools/validate_mocks.py` |
| Скрипты демо-стенда и e2e | Bash + curl | `scripts/demo-up.sh`, `backend/scripts/run_frontend_e2e.sh` |

---

## 4. Системные требования окружения

| Компонент | Требуемая версия | Назначение |
|---|---|---|
| Node.js | ≥ 20.9 (проверено на 26.5) | Сборка и рантайм Next.js фронтенда |
| npm | ≥ 10.0 (проверено на 11.17) | Установка npm-зависимостей строго по lockfile |
| Python | ≥ 3.11 (проверено на 3.11.x) | Рантайм бэкенда FastAPI и ML-модулей |
| uv | ≥ 0.4.0 | Управление зависимостями и запуск Python-окружения |
| curl, bash | Системные POSIX-утилиты | Скрипты автоматического демо-стенда |

**Обновлено:** 2026-09-29.
