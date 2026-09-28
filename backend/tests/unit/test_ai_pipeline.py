"""Тесты LangGraph-пайплайна, детерминированных проверок и судьи (T033, T036, T041, T042, T043)."""

import unittest

from ml.pipeline.checks import run_deterministic_checks
from ml.pipeline.graph import build_pipeline_graph
from ml.pipeline.judge import evaluate_with_judge
from ml.pipeline.models import LocalChatAdapter
from ml.pipeline.review import record_human_decision
from ml.pipeline.state import PipelineState


class AiPipelineTests(unittest.TestCase):
    def test_pipeline_state_structure(self) -> None:
        """Состояние конвейера содержит все обязательные поля типизированного состояния."""
        state = PipelineState(
            run_id="run-001",
            thread_id="th-001",
            source_ticket_id="ticket-101",
            situation_no=1,
            mode="operator112",
            sanitized_ticket={"source_ticket_id": "ticket-101", "sanitized_text": "Пожар"},
            prompt_version="semantic_review_v1",
            base_output=None,
            base_reasoning_summary=None,
            teacher_candidates=[],
            checks_passed=False,
            check_failures=[],
            judge_review=None,
            human_decision=None,
            final_example=None,
            status="pending",
        )
        self.assertEqual(state["run_id"], "run-001")
        self.assertEqual(state["status"], "pending")

    def test_deterministic_checks_rejects_hallucinated_codes_and_addresses(self) -> None:
        """Проверки отсекают выдуманный код ЕКП или несуществующий адрес."""
        invalid_candidate = {
            "ekp_code": "99999-FAKE",  # Несуществующий код ЕКП
            "address": "ул. Вымышленная д. 999",  # Несуществующий адрес
            "reference_fact_ids": ["fact-1"],
            "decision": "correct",
            "text": "Отправлен наряд",
        }
        res = run_deterministic_checks(
            candidate=invalid_candidate,
            allowed_fact_ids=["fact-1"],
            mode="operator112",
        )
        self.assertFalse(res.passed)
        self.assertTrue(any("ЕКП" in f for f in res.failures))

    def test_deterministic_checks_detects_pii_and_loops(self) -> None:
        """Проверки выявляют попытку вставки персональных данных или зацикливания."""
        pii_candidate = {
            "ekp_code": "10101",
            "address": "ул. Тверская",
            "reference_fact_ids": ["fact-1"],
            "decision": "correct",
            "text": "Перезвоните заявителю Иванов Иван Иванович +79991234567 срочно!",
        }
        res_pii = run_deterministic_checks(pii_candidate, allowed_fact_ids=["fact-1"], mode="operator112")
        self.assertFalse(res_pii.passed)
        self.assertTrue(any("ПДн" in f or "PII" in f for f in res_pii.failures))

        loop_candidate = {
            "ekp_code": "10101",
            "address": "ул. Тверская",
            "reference_fact_ids": ["fact-1"],
            "decision": "correct",
            "text": "повтор фразы " * 25,
        }
        res_loop = run_deterministic_checks(loop_candidate, allowed_fact_ids=["fact-1"], mode="operator112")
        self.assertFalse(res_loop.passed)
        self.assertTrue(any("цикл" in f or "повтор" in f for f in res_loop.failures))

    def test_judge_blind_evaluation_and_schema(self) -> None:
        """Судья оценивает baseline и candidate отдельно, следуя judge-review-v1.schema.json."""
        baseline_ans = {"decision": "uncertain", "rationale": "Не уверен", "factIds": ["fact-1"], "errorIds": []}
        candidate_ans = {"decision": "correct", "rationale": "Факты совпадают", "factIds": ["fact-1"], "errorIds": []}

        review = evaluate_with_judge(
            situation_text="Дым в подъезде",
            reference_fact_ids=["fact-1"],
            allowed_error_ids=["err-timeout"],
            baseline_answer=baseline_ans,
            candidate_answer=candidate_ans,
            judge_model_family="llama",
            candidate_model_family="qwen",
        )

        self.assertIn("baseline", review)
        self.assertIn("candidate", review)
        self.assertIn("needsHuman", review)
        self.assertEqual(review["baseline"]["decision"], "uncertain")
        self.assertEqual(review["candidate"]["decision"], "correct")
        # Поскольку baseline uncertain, требуется человек
        self.assertTrue(review["needsHuman"])

    def test_judge_same_model_family_requires_human(self) -> None:
        """Если судья и кандидат принадлежат к одному семейству моделей, требуется человек."""
        baseline_ans = {"decision": "correct", "rationale": "Ок", "factIds": ["fact-1"], "errorIds": []}
        candidate_ans = {"decision": "correct", "rationale": "Ок", "factIds": ["fact-1"], "errorIds": []}

        review = evaluate_with_judge(
            situation_text="Дым в подъезде",
            reference_fact_ids=["fact-1"],
            allowed_error_ids=[],
            baseline_answer=baseline_ans,
            candidate_answer=candidate_ans,
            judge_model_family="qwen",
            candidate_model_family="qwen",  # Совпадение семейств
        )
        self.assertTrue(review["needsHuman"])
        self.assertIn("моделей", review.get("disagreementReason", "").lower())

    def test_graph_interrupt_and_idempotent_resume(self) -> None:
        """LangGraph останавливается на interrupt при needsHuman и возобновляется без повтора вызова."""
        call_counter = {"baseline": 0, "teacher": 0}

        def base_gen(msgs: list) -> str:
            call_counter["baseline"] += 1
            return '{"decision": "uncertain", "rationale": "Базовый ответ", "factIds": ["fact-1"], "errorIds": []}'

        def teacher_gen(msgs: list) -> str:
            call_counter["teacher"] += 1
            return '{"ekp_code": "10101", "address": "ул. Тверская", "decision": "correct", "text": "Норма", "reference_fact_ids": ["fact-1"], "errorIds": []}'

        baseline_model = LocalChatAdapter(model_name="small-qwen", model_family="qwen", response_generator=base_gen)
        teacher_model = LocalChatAdapter(model_name="strong-qwen", model_family="qwen", response_generator=teacher_gen)

        graph, checkpointer = build_pipeline_graph(
            baseline_model=baseline_model,
            teacher_model=teacher_model,
            judge_model_family="llama",
        )

        initial_state = PipelineState(
            run_id="run-test-42",
            thread_id="thread-test-42",
            source_ticket_id="ticket-101",
            situation_no=1,
            mode="operator112",
            sanitized_ticket={
                "source_ticket_id": "ticket-101",
                "situation_no": 1,
                "sanitized_text": "Дым в подъезде",
                "source_hash": "a" * 64,
                "reviewer_id": "t-1",
                "reviewed_at": "2026-09-27T10:00:00Z",
                "pii_check": "passed",
                "approved": True,
            },
            prompt_version="semantic_review_v1",
            base_output=None,
            base_reasoning_summary=None,
            teacher_candidates=[],
            checks_passed=False,
            check_failures=[],
            judge_review=None,
            human_decision=None,
            final_example=None,
            status="pending",
        )

        config = {"configurable": {"thread_id": "thread-test-42"}}
        # Запуск до прерывания
        result = graph.invoke(initial_state, config=config)

        # Граф должен дойти до прерывания human_adjudication
        self.assertEqual(call_counter["baseline"], 1)
        self.assertEqual(call_counter["teacher"], 1)
        self.assertEqual(result["status"], "waiting_human_review")

        # Человек принимает решение и сохраняет в журнал
        record_human_decision(
            thread_id="thread-test-42",
            reviewer_id="teacher-senior-1",
            decision="accepted",
            reason="Проверено преподавателем вручную",
        )

        # Возобновляем граф
        resumed = graph.invoke(None, config=config)

        self.assertEqual(resumed["status"], "completed")
        self.assertIsNotNone(resumed["final_example"])
        # Счётчики вызовов моделей НЕ должны увеличиться при resume
        self.assertEqual(call_counter["baseline"], 1)
        self.assertEqual(call_counter["teacher"], 1)


if __name__ == "__main__":
    unittest.main()
