# Quickstart: проверка слияния (021)

Все команды — из корня worktree интеграционной ветки, если не сказано иное.

## Подготовка (один раз)

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune
git worktree add ../RespondersAcademy-merge -b merge/021-branch-consolidation origin/main
```

```bash
cd ../RespondersAcademy-merge && npm ci && (cd backend && uv sync --group dev)
```

## Быстрый гейт (после каждого куска)

```bash
npm run lint && npm run steiger && npm run typecheck && npm run test
```

```bash
cd backend && uv run python scripts/extract_ts_fields.py && uv run pytest -q && uv run ruff check .
```

Ожидание: всё зелёное или каждый красный тест записан в журнал как унаследованный, с доказательством.

## Гейт кластера (после F3, F5, F7)

```bash
npm run build
```

```bash
cd backend && uv run alembic heads
```

Ожидание: ровно одна голова.

Миграции с нуля проверяет `backend/tests/integration/test_alembic.py`, он входит в `pytest`.

## Финальный гейт (F8)

```bash
npm run check && npm run mocks:validate
```

```bash
backend/scripts/run_frontend_e2e.sh
```

```bash
npm run e2e
```

Если Playwright-браузеров нет, см. урок L017 (временный конфиг, не коммитить).

## Проверка полноты (SC-001, SC-002)

```bash
for b in $(git branch -r --format='%(refname:short)' | grep -v -e HEAD -e optimistic-maxwell); do echo "$b: $(git rev-list --count --no-merges HEAD..$b)"; done
```

Ожидание: 0 для каждой вливаемой ветки. Для `feat/011-dds-card-feed` и `claude/zealous-goldberg-mu6erp`
значение будет больше 0, а их содержимое подтверждается сверкой F4 в журнале.
