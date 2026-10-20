# Implementation Plan: ИИ-чат-ассистент разбора попытки

**Branch**: `fix/ai-connection-probe-timeout` (рабочая; отдельную ветку фичи не создавали) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Боковая шторка чата на экране разбора попытки `/student/results/[attemptId]` (только обучающийся-владелец). Ответы строит бэкенд: `POST /api/v1/ai/chat` собирает обезличенные факты попытки (баллы, превышение нормативов, формулировки нарушений, эталонные требования), вызывает единую точку `llm.complete_json` (облако Polza.ai → локальная модель → шаблон) внутри `llm_scope`, проверяет ответ `validate_text` и возвращает `reply + source + provider`. Фронт: виджет `attempt-chat` (шторка, лента, поле ввода, чипы), история в `sessionStorage`, бейдж `AiSourceBadge` на каждом ответе. Новых таблиц нет, нового провайдера нет, зависимостей нет.

## Technical Context

**Language/Version**: Python 3.11+ (FastAPI, Pydantic v2); TypeScript strict, Next.js App Router (версия — `node_modules/next/package.json`; перед кодом читать `node_modules/next/dist/docs/`).
**Primary Dependencies**: существующие — `ml.generate.llm` (`complete_json`, `OllamaClient`, `PolzaClient`), `ai_health_service.llm_scope`, `report_ai_text` (`validate_text`, `ERROR_TITLES`), `external_ai_audit`, `AiSourceBadge`, `shared/ui/platform`. Новых нет.
**Storage**: N/A на сервере (история только в `sessionStorage` клиента); исходы пишутся в существующие `ai_health` и аудит.
**Testing**: pytest (unit для сборки фактов/промпта/усечения истории, contract для ответа и 401/403/404/429 + парные 200, integration для каскада облако → локально → шаблон); Vitest + RTL (шторка, ввод, чипы, бейдж, drag-drop); Playwright/HTTP-сценарий — один сквозной.
**Target Platform**: desktop-first браузер; бэкенд на CPU без GPU.
**Project Type**: web (фронт Next.js + бэкенд FastAPI).
**Performance Goals**: шторка открывается ≤ 250 мс; ответ — SC-002 (ориентиры облако ≤ 3 с, локально ≤ 10 с, не измерено).
**Constraints**: облако по умолчанию выключено; в запрос только обезличенные агрегаты и вопрос; предел ожидания текста; без вложений.
**Scale/Scope**: один экран, один эндпоинт, ~1 новый виджет FSD, ~8 файлов бэкенда/фронта.

## Constitution Check

| Принцип | Оценка |
|---|---|
| I. Локальный контур, облако в рантайме запрещено | ⚠️ **Требует решения владельца.** `AGENTS.md` §2 разрешает облако только для генерации сценариев и пояснения карты ошибок (фича 006 расширила на тексты отчётов). Чат — новая цель отправки данных наружу. Без ключа/по умолчанию (`local`) контур остаётся локальным, но формальную поправку §2 («+ ответы чата разбора попытки») должен одобрить владелец до включения облачного пути для чата. План предусматривает флаг цели: `attempt_chat` не уходит в облако, пока поправка не принята (см. research R2). |
| II. Методическая достоверность | ✅ ответ опирается только на переданные факты и формулировки правил; ИИ помечен; оценка не меняется, итог за преподавателем. |
| III. Измеримый ML | ✅ чат не оценивает, оценку не изменяет. |
| IV. YAGNI | ✅ без хранилища, без новых таблиц, без вложений; один эндпоинт. |
| V. Единый контракт | ✅ `ChatRequest/ChatResponse` в camelCase, TS-типы и `expected_fields.json` обновляются. |

Повторная проверка после дизайна: нарушений сверх пункта I нет.

## Project Structure

### Documentation
```text
spec/010-ai-chat-assistant/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
└── tasks.md   # создаёт /speckit-tasks
```

### Source Code
```text
backend/app/api/v1/ai_chat.py            # POST /ai/chat (роутер; подключить в api/v1/__init__.py)
backend/app/schemas/v1/ai_chat.py        # ChatRequest/ChatResponse (camelCase)
backend/app/services/attempt_chat.py     # факты попытки, промпт, усечение истории, шаблон, вызов complete_json
backend/app/services/external_ai_audit.py  # + PURPOSES["attempt_chat"]
backend/tests/{unit,contract,integration}/test_attempt_chat*.py

app/api/v1/ai/chat/route.ts              # автономный мок-ответ (шаблон)
src/shared/api/types/ai-chat.ts          # TS-контракт; экспорт в index
src/shared/api/endpoints/ai-chat.ts      # postAttemptChat
src/widgets/attempt-chat/                # шторка: ChatDrawer, MessageFeed, ChatInput, QuickChips, model/ (useChat, history storage)
src/pages/student/results/ui/StudentResultDetailScreen.tsx  # кнопка в actions PageHeader + монтирование виджета
```
**Structure Decision**: чат — widget (составной блок с состоянием), страница лишь монтирует; слой `entities` не нужен (YAGNI). История — за интерфейсом в `shared/lib` (по правилам фронта), подменяется в тестах.

## Phase 0 / Phase 1

Артефакты: [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md).

## Риски

- Решение владельца по облаку для чата (R2), иначе облачная ветка не включается.
- Локальная 0.8B может часто не проходить `validate_text` → чат чаще отвечает шаблоном; замер — задача в tasks.
- Источник фактов для студента: `/ai/attempts/{id}/review` студенту закрыт (403), использовать сервис оценки за `compat`/`operator112` evaluation (`evaluation_service.get_or_create_evaluation`), а не этот эндпоинт.
- Дерево грязное (feature 007): стейджить только свои файлы.
