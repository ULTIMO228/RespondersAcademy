# Журнал слияния (021)

Формат — [contracts/merge-journal.md](contracts/merge-journal.md). Только дописывать.

## Шапка

- Интеграционная ветка: `merge/021-branch-consolidation`, worktree `../RespondersAcademy-merge`
- База: `origin/main` `ba1f7d8` (2026-10-20)
- Вершины на старте (2026-10-20, после `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`):
  SASHA `ad5e271` · develop `db44740` · feat/011-dds-sasha `ada3e78` · feat/011-dds-card-feed `32e2160` ·
  fix/ai-connection-probe-timeout `5e309ef` · codex/feature-007-learner-role-split `971261d` ·
  feature/scenario-graph-builder `cdef678` · claude/gracious-darwin-x0znyd `8c992c6` ·
  claude/zealous-goldberg-mu6erp `ce6c3dd` · claude/optimistic-maxwell-wxwdzs `9924210` (K12, сдвинулась с `d9782c6`:
  `9924210` «папка presa с презентацией…»; не вливается, Q3)
- Решения перед стартом: В1 → `specializations`; В2 → внешнее только опцией, выключено по умолчанию; коммиты в
  интеграционной ветке разрешены владельцем; push и main — нет (spec.md, Clarifications)
- ⚠️ main `ba1f7d8`: имя pptx в коммите хранится в NFD, при `core.precomposeunicode=true` git показывает файл как
  неотслеживаемый `??`. Особенность main, на слияние не влияет; файл не стейджить
- Окружение: Node 24.15.0, next 16.3.5, `node_modules` — APFS-клон из основного дерева (`package.json`/lock ни одна
  ветка не меняет — проверено `git diff origin/main...<ветка>` по всем 12), `uv sync --group dev`
