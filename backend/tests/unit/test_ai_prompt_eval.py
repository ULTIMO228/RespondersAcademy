"""Тесты оценки системных промптов и профилей рассуждений (T033, T045, T046)."""

import unittest

from ml.pipeline.reasoning import ReasoningProfile, check_reasoning_limits
from ml.scripts.eval_ai_prompts import PromptEvalRunner


class AiPromptEvalTests(unittest.TestCase):
    def test_prompt_eval_requires_at_least_three_repetitions(self) -> None:
        """Оценка промпта требует минимум 3 повтора каждого случая."""
        runner = PromptEvalRunner(prompt_version="semantic_review_v1", repetitions=2)
        with self.assertRaisesRegex(ValueError, "минимум 3 повтора"):
            runner.run_eval(cases=[{"id": "case-1", "text": "Дым"}])

    def test_prompt_eval_computes_metrics_and_variance(self) -> None:
        """Оценка промпта вычисляет Macro-F1, точность и стандартное отклонение между повторами."""
        runner = PromptEvalRunner(prompt_version="semantic_review_v1", repetitions=3)
        cases = [
            {"id": "c1", "text": "Пожар на Тверской", "expected": "equivalent", "mode": "operator112"},
            {"id": "c2", "text": "Непонятный шум на улице", "expected": "uncertain", "mode": "operator112"},
            {"id": "c3", "text": "Кошка на дереве без угрозы", "expected": "different", "mode": "dds"},
        ]
        # Мок-генерация ответов
        report = runner.run_eval(cases=cases, mock_responses=["equivalent", "uncertain", "different"])

        self.assertEqual(report.repetitions, 3)
        self.assertGreaterEqual(report.metrics.macro_f1, 0.0)
        self.assertGreaterEqual(report.metrics.schema_validity, 0.95)
        self.assertIsNotNone(report.metrics.std_dev)
        self.assertEqual(len(report.all_outputs), 9)  # 3 кейса * 3 повтора

    def test_prompt_eval_checks_domain_terminology(self) -> None:
        """Проверяется корректность использования терминов АРМ-112 и ДДС."""
        runner = PromptEvalRunner(prompt_version="semantic_review_v1", repetitions=3)
        text_with_terms = "Передано в ДДС-01 и службу 112 для реагирования по регламенту"
        terms_ok = runner.verify_domain_terminology(text_with_terms)
        self.assertTrue(terms_ok)

        text_wrong = "Случайный разговор без терминологии"
        terms_wrong = runner.verify_domain_terminology(text_wrong)
        self.assertFalse(terms_wrong)

    def test_prompt_eval_strictly_forbids_holdout_split(self) -> None:
        """Оценка промптов запрещена на закрытом holdout-наборе."""
        runner = PromptEvalRunner(prompt_version="semantic_review_v1", repetitions=3)
        holdout_cases = [{"id": "c-holdout-1", "split": "holdout", "text": "Секретный тест"}]
        with self.assertRaises(PermissionError):
            runner.run_eval(cases=holdout_cases)

    def test_reasoning_limits_and_watchdog(self) -> None:
        """Профиль рассуждения контролирует max tokens, timeout и зацикливание."""
        profile = ReasoningProfile(
            model_revision="qwen3.5-0.8b",
            runtime_revision="ollama-0.3",
            max_output_tokens=50,
            timeout_ms=1000,
            repetition_stop=True,
        )
        # Нормальный ответ укладывается в лимиты
        ok_res = check_reasoning_limits(text="Краткое основание вывода", duration_ms=200, profile=profile)
        self.assertTrue(ok_res.is_valid)

        # Зацикленный ответ останавливается watchdog
        looping_text = "повтор " * 40
        loop_res = check_reasoning_limits(text=looping_text, duration_ms=200, profile=profile)
        self.assertFalse(loop_res.is_valid)
        self.assertEqual(loop_res.failure_reason, "repetition_detected")


if __name__ == "__main__":
    unittest.main()
