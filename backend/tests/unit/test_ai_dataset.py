"""Тесты санитизации SanitizedTicket, сплита датасета и изоляции holdout (T033, T037, T038)."""

import unittest

from ml.pipeline.sanitize import validate_sanitized_ticket
from ml.pipeline.split import DatasetSplit, split_dataset_by_ticket
from ml.source_gate import SourceGateError


class AiDatasetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.valid_ticket_dict = {
            "source_ticket_id": "ticket-moscow-101",
            "situation_no": 1,
            "sanitized_text": "Запах дыма в подъезде дома по ул. Тверская 12, открытого горения не видно.",
            "source_hash": "a" * 64,
            "reviewer_id": "teacher-senior-1",
            "reviewed_at": "2026-09-27T10:00:00Z",
            "pii_check": "passed",
            "approved": True,
        }

    def test_sanitized_ticket_gate_success(self) -> None:
        """Очищенный и утверждённый билет успешно проходит валидацию."""
        approved = validate_sanitized_ticket(self.valid_ticket_dict)
        self.assertEqual(approved.source_ticket_id, "ticket-moscow-101")
        self.assertEqual(approved.situation_no, 1)
        self.assertEqual(approved.reviewer_id, "teacher-senior-1")

    def test_sanitized_ticket_gate_rejects_unapproved(self) -> None:
        """Билет без прохождения PII или без утверждения преподавателем отклоняется."""
        unapproved = dict(self.valid_ticket_dict, pii_check="failed")
        with self.assertRaises(SourceGateError):
            validate_sanitized_ticket(unapproved)

        unapproved2 = dict(self.valid_ticket_dict, approved=False)
        with self.assertRaises(SourceGateError):
            validate_sanitized_ticket(unapproved2)

    def test_split_by_source_ticket_id_prevents_leakage(self) -> None:
        """Разбиение строго по sourceTicketId: все ситуации билета в одном сплите."""
        records = []
        for ticket_idx in range(1, 15):
            ticket_id = f"ticket-{ticket_idx:03d}"
            for sit_no in (1, 2):
                records.append({
                    "source_ticket_id": ticket_id,
                    "situation_no": sit_no,
                    "mode": "operator112" if sit_no == 1 else "dds",
                    "sanitized_text": f"Ситуация {sit_no} билета {ticket_id}",
                    "case_type": "correct" if ticket_idx % 3 == 0 else ("incorrect" if ticket_idx % 3 == 1 else "uncertain"),
                })

        split = split_dataset_by_ticket(records, train_ratio=0.5, val_ratio=0.2, holdout_ratio=0.3, seed=42)

        train_tickets = {r["source_ticket_id"] for r in split.train}
        val_tickets = {r["source_ticket_id"] for r in split.val}
        holdout_tickets = {r["source_ticket_id"] for r in split.holdout}

        # Пересечение билетов между сплитами строго пустое
        self.assertTrue(train_tickets.isdisjoint(val_tickets))
        self.assertTrue(train_tickets.isdisjoint(holdout_tickets))
        self.assertTrue(val_tickets.isdisjoint(holdout_tickets))

    def test_holdout_contains_both_modes_and_case_types(self) -> None:
        """Holdout содержит оба режима и ≥8 независимых билетов при наличии данных."""
        records = []
        # Генерируем 16 билетов с обоими режимами
        for i in range(1, 17):
            tid = f"ticket-synth-{i:03d}"
            case_type = "correct" if i % 3 == 0 else ("incorrect" if i % 3 == 1 else "uncertain")
            records.append({"source_ticket_id": tid, "situation_no": 1, "mode": "operator112", "case_type": case_type})
            records.append({"source_ticket_id": tid, "situation_no": 2, "mode": "dds", "case_type": case_type})

        split = split_dataset_by_ticket(records, train_ratio=0.4, val_ratio=0.1, holdout_ratio=0.5, seed=123)

        holdout_modes = {r["mode"] for r in split.holdout}
        holdout_case_types = {r["case_type"] for r in split.holdout}
        holdout_ticket_count = len({r["source_ticket_id"] for r in split.holdout})

        self.assertIn("operator112", holdout_modes)
        self.assertIn("dds", holdout_modes)
        self.assertTrue({"correct", "incorrect", "uncertain"}.issubset(holdout_case_types))
        self.assertGreaterEqual(holdout_ticket_count, 8)

    def test_holdout_isolation_access_guard(self) -> None:
        """Генератор и подбор промпта не могут получить holdout без авторизации."""
        split = DatasetSplit(train=[{"id": 1}], val=[{"id": 2}], holdout=[{"id": 3}])
        self.assertEqual(len(split.get_train()), 1)
        self.assertEqual(len(split.get_val()), 1)

        # Без спец-флага holdout недоступен
        with self.assertRaises(PermissionError):
            split.get_holdout(allow_release_eval=False)

        # При release_eval доступ разрешён
        holdout = split.get_holdout(allow_release_eval=True)
        self.assertEqual(len(holdout), 1)


if __name__ == "__main__":
    unittest.main()
