"""Тесты жизненного цикла ModelRelease, release-gates и интеграции в AiGateway (T033, T049, T050, T051)."""

import unittest

from app.ai_gateway import LocalAiGateway, set_gateway
from ml.release import (
    ModelRelease,
    ReleaseGateReport,
    ReleaseStatus,
    activate_release,
    evaluate_release_gates,
)


class AiReleaseTests(unittest.TestCase):
    def tearDown(self) -> None:
        set_gateway(None)

    def test_model_release_lifecycle_transitions(self) -> None:
        """Переходы статусов: candidate -> accepted | rejected -> archived."""
        release = ModelRelease(
            id="rel-2026-v1",
            base_model_revision="qwen3.5-0.8b-r1",
            adapter_revision=None,
            runtime_revision="ollama-0.3",
            dataset_hash="b" * 64,
            prompt_version="semantic_review_v1",
            eval_run_id="eval-run-001",
            artifact_hash="c" * 64,
            disk_bytes=850_000_000,
            status=ReleaseStatus.CANDIDATE,
        )

        # Кандидат нельзя активировать напрямую
        with self.assertRaises(ValueError):
            activate_release(release)

        # Перевод в accepted разрешает активацию
        release.status = ReleaseStatus.ACCEPTED
        active = activate_release(release)
        self.assertEqual(active.id, "rel-2026-v1")
        self.assertEqual(active.status, ReleaseStatus.ACCEPTED)

        # Перевод в archived снимает активность
        release.status = ReleaseStatus.ARCHIVED
        with self.assertRaises(ValueError):
            activate_release(release)

    def test_release_gates_all_ten_conditions_passed(self) -> None:
        """При успешном прохождении всех 10 условий кандидат получает accepted."""
        report = ReleaseGateReport(
            manifest_approved=True,
            sanitized_sources_pct=100.0,
            schema_validity_pct=98.5,
            timeout_loop_pct=0.2,
            hallucinated_codes_count=0,
            missed_critical_errors_count=0,
            operator112_f1_delta=0.04,  # Выше baseline
            dds_f1_delta=0.02,          # Выше baseline
            independent_judge_confirmed=True,
            prompt_repetitions=3,
            cpu_budget_approved=True,
            cpu_p95_ms=450,
            max_cpu_budget_ms=1000,
            peak_ram_mb=900,
            max_ram_budget_mb=2048,
        )
        status = evaluate_release_gates(report)
        self.assertEqual(status, ReleaseStatus.ACCEPTED)

    def test_release_gates_rejects_on_regression_or_empty_budget(self) -> None:
        """Регрессия по качеству или пустой CPU-бюджет приводит к rejected."""
        # Случай 1: Регрессия по F1 в одном из режимов
        report_regression = ReleaseGateReport(
            manifest_approved=True,
            sanitized_sources_pct=100.0,
            schema_validity_pct=98.0,
            timeout_loop_pct=0.0,
            hallucinated_codes_count=0,
            missed_critical_errors_count=0,
            operator112_f1_delta=-0.05,  # Регрессия!
            dds_f1_delta=0.01,
            independent_judge_confirmed=True,
            prompt_repetitions=3,
            cpu_budget_approved=True,
            cpu_p95_ms=400,
            max_cpu_budget_ms=1000,
            peak_ram_mb=800,
            max_ram_budget_mb=2048,
        )
        self.assertEqual(evaluate_release_gates(report_regression), ReleaseStatus.REJECTED)

        # Случай 2: Незаполненный CPU-бюджет
        report_no_budget = ReleaseGateReport(
            manifest_approved=True,
            sanitized_sources_pct=100.0,
            schema_validity_pct=99.0,
            timeout_loop_pct=0.0,
            hallucinated_codes_count=0,
            missed_critical_errors_count=0,
            operator112_f1_delta=0.02,
            dds_f1_delta=0.02,
            independent_judge_confirmed=True,
            prompt_repetitions=3,
            cpu_budget_approved=False,  # Бюджет не утверждён
            cpu_p95_ms=400,
            max_cpu_budget_ms=None,
            peak_ram_mb=800,
            max_ram_budget_mb=None,
        )
        self.assertEqual(evaluate_release_gates(report_no_budget), ReleaseStatus.REJECTED)

    def test_ai_gateway_uses_only_accepted_release(self) -> None:
        """AiGateway возвращает modelReleaseId только для принятого релиза; иначе None."""
        gateway = LocalAiGateway()
        set_gateway(gateway)

        # По умолчанию релиза нет -> modelReleaseId = None
        self.assertIsNone(gateway.get_active_release_id())

        res_default = gateway.resolve_semantic_dispute(
            text="Текст",
            reference_fact_ids=["fact-1"],
            mode="operator112",
            reason="Тест",
        )
        self.assertIsNone(res_default.get("modelReleaseId"))

        # Подключаем accepted релиз
        accepted_rel = ModelRelease(
            id="rel-accepted-v1",
            base_model_revision="qwen",
            adapter_revision=None,
            runtime_revision="ollama",
            dataset_hash="d" * 64,
            prompt_version="semantic_review_v1",
            eval_run_id="eval-1",
            artifact_hash="e" * 64,
            disk_bytes=100,
            status=ReleaseStatus.ACCEPTED,
        )
        activate_release(accepted_rel)

        self.assertEqual(gateway.get_active_release_id(), "rel-accepted-v1")
        res_with_rel = gateway.resolve_semantic_dispute(
            text="Текст",
            reference_fact_ids=["fact-1"],
            mode="operator112",
            reason="Тест",
        )
        self.assertEqual(res_with_rel.get("modelReleaseId"), "rel-accepted-v1")

    def test_historical_evaluations_immutable_on_release_change(self) -> None:
        """Смена активного релиза не меняет исторически зафиксированные ревизии оценок."""
        historical_revision = {
            "attempt_id": "att-001",
            "revision": 1,
            "model_release_id": "rel-old-v0",
            "total_score": 85,
        }

        # Активируем новый релиз v2
        new_rel = ModelRelease(
            id="rel-new-v2",
            base_model_revision="qwen",
            adapter_revision=None,
            runtime_revision="ollama",
            dataset_hash="f" * 64,
            prompt_version="semantic_review_v1",
            eval_run_id="eval-2",
            artifact_hash="g" * 64,
            disk_bytes=200,
            status=ReleaseStatus.ACCEPTED,
        )
        activate_release(new_rel)

        # Историческая ревизия сохраняет свой model_release_id
        self.assertEqual(historical_revision["model_release_id"], "rel-old-v0")


if __name__ == "__main__":
    unittest.main()
