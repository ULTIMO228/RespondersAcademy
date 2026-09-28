# Перечень использованных библиотек и компонентов

Артефакт сдачи по ТЗ §13 («Перечень всех использованных библиотек и компонентов»), задача `T5.3-02`.
Источник — `package.json`; версии — фактически установленные, из `package-lock.json` (lockfile в репозитории,
воспроизводится командой `npm ci`).

> **Внешних CDN и сетевых вызовов в приложении нет.** Все ассеты — локальные: иконки АРМ-112 (`icons/` →
> `public/icons/`), шрифт — системный (`--font-ui: Roboto, "Segoe UI", Arial, …`, `src/shared/ui/styles/vars.css`),
> данные — JSON из `mocks/`. Приложение обращается только к собственному мок-API `/api/mock/*` на том же origin.
> Проверено grep-аудитом `src/`, `app/`, `public/` на `http(s)://` (волна 5, T5.1-12 → `offline-check.md`):
> внешних URL в рантайм-коде и ассетах нет.

## Зависимости рантайма (`dependencies` — 3 пакета)

Попадают в production-сборку.

| Пакет | Диапазон в `package.json` | Установленная версия | Лицензия | Для чего используется в проекте |
|---|---|---|---|---|
| `next` | `latest` | 16.3.5 | MIT | Фреймворк приложения: App Router (`app/`), серверные Route Handlers мок-API `/api/mock/**`, middleware-прокси сессии (`proxy.ts`), сборка и сервер (`next build` / `next start`). |
| `react` | `latest` | 19.3.0 | MIT | Библиотека UI: все экраны, виджеты и UI-примитивы FSD-слоёв `src/**`. |
| `react-dom` | `latest` | 19.3.0 | MIT | Рендер React в DOM в браузере и на сервере (SSR-часть Next.js). |

## Зависимости разработки (`devDependencies` — 18 пакетов)

В production-сборку не попадают.

| Пакет | Диапазон в `package.json` | Установленная версия | Лицензия | Для чего используется в проекте |
|---|---|---|---|---|
| `@feature-sliced/steiger-plugin` | `^0.7.0` | 0.7.0 | MIT | Набор правил Feature-Sliced Design для Steiger — гейт архитектуры `src/` (`npm run steiger`). |
| `@playwright/test` | `^1.63.0` | 1.63.0 | Apache-2.0 | Браузерный e2e-раннер демо-пути (инфраструктура фазы 5.1). Основной сквозной контур на момент подготовки сдачи — HTTP-скрипты `scripts/e2e-*.sh`; см. «Ограничения» в `README.md`. |
| `@testing-library/dom` | `^10.4.2` | 10.4.2 | MIT | Базовые запросы к DOM (`getByRole`, `getByText`) — peer-зависимость React-версии библиотеки. |
| `@testing-library/jest-dom` | `^7.0.1` | 7.0.1 | MIT | Матчеры состояния DOM в тестах (`toBeInTheDocument`, `toBeDisabled`, `toHaveAccessibleName`). |
| `@testing-library/react` | `^16.3.3` | 16.3.3 | MIT | Рендер и взаимодействие с компонентами в компонентных тестах (`render`, `userEvent`). |
| `@types/node` | `latest` | 26.6.1 | MIT | Типы Node.js для серверного кода мок-слоя и скриптов (`scripts/sync-mocks.mjs`). |
| `@types/react` | `latest` | 19.3.0 | MIT | Типы React для TS strict. |
| `@types/react-dom` | `latest` | 19.3.0 | MIT | Типы `react-dom` для TS strict. |
| `@vitejs/plugin-react` | `^6.1.1` | 6.1.1 | MIT | JSX-трансформ для Vitest (`vitest.config.mts`) — без него компонентные тесты не собираются. |
| `eslint` | `^9.39.5` | 9.39.5 | MIT | Линтер (`npm run lint`), конфиг `eslint.config.mjs`. |
| `eslint-config-next` | `^16.3.5` | 16.3.5 | MIT | Правила ESLint для Next.js (App Router, серверные/клиентские границы). |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | MIT | Правила `rules-of-hooks` и `exhaustive-deps` (обязательны по `spec/000-фронт/10-code-rules.md` §4). |
| `jsdom` | `^30.1.0` | 30.1.0 | MIT | DOM-окружение для Vitest (браузерных зависимостей у юнит/компонентных тестов нет). |
| `prettier` | `^3.9.8` | 3.9.8 | MIT | Единое форматирование (`npm run format:check`), конфиг `.prettierrc`. |
| `steiger` | `^0.6.0` | 0.6.0 | MIT | Запуск FSD-линтера по `src/` — обязательный гейт архитектуры. |
| `typescript` | `latest` | 5.9.3 | Apache-2.0 | Компилятор и проверка типов в strict-режиме (`npm run typecheck`). |
| `typescript-eslint` | `^8.70.0` | 8.70.0 | MIT | Парсер и правила ESLint для TypeScript. |
| `vitest` | `^5.0.1` | 5.0.1 | MIT | Раннер юнит- и компонентных тестов (`npm run test`). |

## Контрактные тесты backend

В `backend` для проверок JSON Schema добавлена одна прямая dev-зависимость; она не входит в runtime backend и frontend.

| Пакет | Диапазон в `backend/pyproject.toml` | Зафиксированная версия (`backend/uv.lock`) | Лицензия | Для чего используется |
|---|---|---|---|---|
| `jsonschema[format-nongpl]` | `>=4.26.0,<5` | 4.26.0 | MIT | Контрактные тесты четырёх схем Draft 2020-12 и legacy `Evaluation`; extra включает проверку `date-time` без GPL-зависимостей. |

## Что написано без библиотек (осознанные решения)

Требование локального контура (`spec/000-фронт/08-qa-decisions.md` в11) и запрет лишних зависимостей — поэтому
следующие вещи реализованы средствами платформы, а не пакетами:

| Возможность | Чем сделано | Где |
|---|---|---|
| Графики отчётов (столбцы, линии, тепловая карта ошибок) | собственные SVG-примитивы без чарт-библиотек | `src/shared/ui/charts`, `src/widgets/report-charts` |
| Экспорт отчёта в PDF | системная печать print-вёрстки (`@media print`), без PDF-библиотек | `src/features/report-export` |
| Экспорт отчёта в CSV | собственный сериализатор с экранированием | `src/features/report-export/lib/csv.ts` |
| Сертификат PDF (заглушка) | `canvas` → JPEG → минимальный PDF 1.4 вручную | `src/pages/progress/lib/certificate-pdf.ts` |
| Состояние и данные | React-хуки + клиент `@/shared/api` поверх `fetch` | `src/shared/api`, слайсы `src/**/model` |
| Форматирование дат и чисел | `Intl` браузера, локаль `ru-RU`, 24-часовое время | `src/shared/lib` |
| Валидатор мок-данных | Python 3 (только стандартная библиотека: `json`, `os`, `re`, `sys`, `datetime`) | `spec/000-фронт/mocks/_tools/validate_mocks.py` |
| Сквозные проверки по HTTP | Bash + `curl` (без npm-зависимостей) | `scripts/e2e-*.sh` |

## Внешние требования окружения (не npm-пакеты)

| Компонент | Версия | Зачем |
|---|---|---|
| Node.js | ≥ 20.9 (движок `next`); проверено на 26.5 | сборка и сервер приложения |
| npm | ≥ 10 (проверено на 11.17) | установка зависимостей по lockfile (`npm ci`) |
| Python 3 | ≥ 3.9 (проверено на 3.9.6) | `npm run mocks:validate` — валидатор структуры моков |
| `curl`, `bash` | системные | сквозные скрипты `scripts/e2e-*.sh` |

## Как сверять этот файл

```bash
# состав и диапазоны
node -e "const p=require('./package.json');console.log(Object.keys({...p.dependencies,...p.devDependencies}).length)"
# установленные версии и лицензии — из lockfile
npm ls --depth=0
```

Количество строк таблиц выше (3 + 18 = 21) должно совпадать с числом записей `dependencies` +
`devDependencies` в `package.json`. При добавлении пакета таблица обновляется в том же коммите.
