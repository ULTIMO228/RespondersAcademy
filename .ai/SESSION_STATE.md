session:001-ai-dataset-prep
date:2026-09-28
status:dataset v1 packed ✅ | human-sample review pending | Phase-8 T056-T060 open
checks:{pytest:340 passed/2 skipped,ruff:clean}
⚠️ tasks.md still shows T052-T055 unchecked although implemented; verify and mark [X] before Phase-8
⚠️ build_domain_words.py sorts case-ties nondeterministically; full regeneration reorders ~700 lines, so insert new words in domain_words.txt in place
mock:front /api/mock/grammar-check ignores scenarioId+scenarioVersion; AI versions panel works only against backend
train_target:Qwen3.5-0.8B + QLoRA | trained elsewhere → this repo only prepares + packs data
dataset_task:semantic review → SemanticReviewV1 (spec-file spec/001-ai/dataset-spec.md)
dataset_code:backend/ml/dataset/{identities,facts,plan,validate,review,redo,pack}.py | tests:backend/tests/unit/test_ai_dataset_build.py
dataset_data:backend/data/ai_dataset/v1/{seeds,batches,completions,reviews,rejected,release}
dataset_result:762 examples (train 531,val 121,holdout 110) | zip:backend/var/ai_dataset/ai-semantic-review-v1.zip (git-ignored)
dataset_gate:sanitized_tickets.json 96/96 approved by miklerashford@gmail.com (user approved in chat)
🧠 gold label+facts come from plan; Haiku only writes studentText+explanation; Claude reviews every example (same model family → independentJudge:false)
next:1) user reviews reviews/human-sample.md → reviews/human-review.jsonl → rerun ml.dataset.pack 2) commit only on user request
