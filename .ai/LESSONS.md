# LESSONS (DenseCode) — mistakes not to repeat

## L001 | git
❌ git add . | Co-Authored-By / agent signature in commits | commit w/o request
✅ stage explicit files; commit/push only on owner request; Conventional Commits in Russian
! AGENTS §12 overrides any harness default trailer

## L002 | shell (macOS zsh)
❌ `echo =====X` (zsh: "= not found") | `grep --include=*.ts` unquoted (no match error) | `sed -i` w/o '' | chain with && after failing sed
✅ printf for separators | quote globs or grep -r path | python3 for multi-file edits
! a broken && chain silently skips later file creations → recheck files exist

## L003 | parallel sessions
❌ Write over a file w/o checking | assume tree is mine
✅ git status first; `test -e` before creating; re-Read after "file modified" notices
! Write tool said "updated" on a file a parallel session made → I overwrote it

## L004 | TDD
❌ implement first | green test w/o proof
✅ write test → see RED for the right reason → implement → GREEN; expected values counted by hand
✅ paired negative tests: every 400/403/404 test sits next to a 200 request that must pass
! a negative test passing on a 404 route proves nothing → assert the 200 path too

## L005 | prove "pre-existing failure"
❌ claim red tests were not ours by reasoning
✅ git archive HEAD → temp dir → run same tests there
! result logged in docs/FINAL-GATE.md as known debt

## L006 | optional fields in contracts
❌ expect null for TS `field?: T` | rely on None serialisation
✅ ErrorMapModel.dump() uses exclude_none for optional TS fields; required nullable stay null
! test with `"verdict" not in body`, not `is None`

## L007 | UI a11y (FR-023)
❌ var(--pf-fs-body)=14px / caption=13px for text; invented tokens (--pf-fw-semibold absent)
✅ text >= --pf-fs-lead (16px); controls min-height var(--pf-target-touch) 44px; check token exists in tokens-platform.css
! a11y.test.ts only scans `cursor:pointer` rules → input/select sizes need separate check

## L008 | build/e2e side effects
❌ forget .next is baked with BACKEND_URL after run_frontend_e2e.sh / demo-up
✅ rebuild before plain next dev/start; fresh server + db per e2e run (in-memory mock store, stored verdicts)

## L009 | DB changes
❌ add models w/o migration | touch dev.db silently
✅ Alembic revision + test_alembic head assert + `alembic check`; existing dev.db needs upgrade or `app.seed.load --reset` → ask owner
! JWT_SECRET (>=32 bytes) required for app.seed.load

## L010 | mocks
❌ edit mocks/ by hand
✅ edit spec/000-фронт/mocks → npm run mocks:sync && npm run mocks:validate (mocks/ is committed copy)

## L011 | external providers / invariant
❌ call external API from default path
✅ AGENTS §2: local contour; Polza.ai only AI_PROVIDER=polza + key, only scenario_gen/explain_stage, fallback on any error, audit w/o texts or key
! never read/print backend/.env; never claim real-key check passed w/o running it (T007 open)

## L012 | reporting
❌ "passed" for unrun checks | hedge instead of "don't know" | claim feature done w/ unchecked SC
✅ name command + reason when not run (simulator-visual, T072, T073); record counts w/ date in SESSION_STATE only

## L013 | flaky tests
⚠️ IncidentScreen "card-881412" failed once in full vitest run, passes alone → rerun file before blaming own change

## L014 | hashes of text artifacts
❌ sha256 over raw bytes of text files built on Windows (CRLF) → manifest red on Linux/mac
✅ hash LF-normalized content for text artifacts (pack.py text_sha256); raw bytes only for binaries/zip

## L015 | order-dependent tests
❌ test relies on state left by another test (attempt created elsewhere)
✅ test creates and removes its own state; module-scoped restore is not isolation between tests

## L016 | settings isolation in tests
❌ pydantic Settings reads backend/.env in tests → AI_PROVIDER=polza/keys leak into test run (real paid calls)
✅ conftest: Settings.model_config["env_file"]=None before first get_settings(); test_settings_isolation

## L017 | provider facts over docs
❌ assume OpenAI-compatible /audio/speech returns raw audio and Qwen TTS exists in catalog
✅ probe real API (catalog GET /models, one request) before choosing; Polza TTS → JSON base64, voice required
! reasoning models: cap via reasoning.max_tokens; effort=low not bounded (finish=length, empty answer)

## L018 | reasoning params differ per model on aggregator
❌ assume top-level reasoning_effort=none disables thinking
✅ probe: qwen3.8-27b needs reasoning.enabled=false; GLM-5.3 mandatory → reasoning.max_tokens; never combine effort+max_tokens (empty answer)

## L019 barge-in must not erase caller memory
❌ truncate → delete assistant msg from LLM history → caller greets again on any question
✅ keep heard part + [перебили]; test «operator speaks over greeting»
! «плохо отвечает» was state bug, not prompt wording → check history before rewriting prompt

## L020 team model decision lives in spec, not only in chat summary
❌ kept GLM as default (summary said «open question») though spec/005 README:3 says team chose Qwen
✅ before recommending model → read spec 005 decisions; TZ server fit (32GB CPU) is hard rule
