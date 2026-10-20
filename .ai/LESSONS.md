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

## L014 | migrations on SQLite with triggers
❌ op.batch_alter_table on ai_scenario_versions in downgrade (recreates table, triggers reference it → "no such table")
✅ op.drop_column directly; add upgrade→downgrade→upgrade + `alembic check` test
! 0006 downgrade was broken until audit; found only by running it, not by upgrade tests

## L015 | tests that cannot fail
❌ negative test where another rule gives the same 403 (author-cannot-review hid a removed permission check)
✅ mutate the guard (remove it) and see the test go red; make actor differ from author
! also: negative test whose graph fails for another reason (unreachable nodes) proves nothing

## L016 | tightening a legacy guard
❌ block legacy approve for pending_review without checking who else enters that state
✅ run the full suite after every guard change; chain drafts (student_card) are created pending_review and use approve
! caught only by tests/integration/test_ai_chain.py + test_seed_chain_demo.py, not by new tests

## L017 | parallel tests on shared SQLite connection
❌ asyncio.gather race test where savepoint rollback of one request erases the other's insert (single shared connection)
✅ simulate the stale read (monkeypatch the read to return None once) and assert the DB constraint path; mutate the constraint to prove the test bites
