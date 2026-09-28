"""Детерминированное разбиение выборки по sourceTicketId до генерации (T038).

Гарантирует отсутствие leakage между train/val/holdout: все ситуации и вариации
одного исходного билета строго попадают в одну группу. Изолирует закрытый holdout.
"""

from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DatasetSplit:
    """Контейнер разбиения выборки с контролем доступа к закрытому holdout."""

    train: list[dict[str, Any]] = field(default_factory=list)
    val: list[dict[str, Any]] = field(default_factory=list)
    holdout: list[dict[str, Any]] = field(default_factory=list)

    def get_train(self) -> list[dict[str, Any]]:
        return list(self.train)

    def get_val(self) -> list[dict[str, Any]]:
        return list(self.val)

    def get_holdout(self, *, allow_release_eval: bool = False) -> list[dict[str, Any]]:
        """Доступ к holdout разрешён ТОЛЬКО для финальной holdout-валидации выпуска."""
        if not allow_release_eval:
            raise PermissionError("Доступ к закрытому holdout запрещён до утверждения манифеста выпуска.")
        return list(self.holdout)


def split_dataset_by_ticket(
    records: list[dict[str, Any]],
    *,
    train_ratio: float = 0.6,
    val_ratio: float = 0.2,
    holdout_ratio: float = 0.2,
    seed: int = 42,
) -> DatasetSplit:
    """Детерминированно разбивает записи строго по уникальным sourceTicketId."""
    if not records:
        return DatasetSplit()

    total_ratio = train_ratio + val_ratio + holdout_ratio
    if abs(total_ratio - 1.0) > 1e-4:
        raise ValueError(f"Сумма долей должна быть 1.0, получено {total_ratio}")

    # Группировка записей по source_ticket_id
    ticket_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        tid = record.get("source_ticket_id")
        if not tid:
            raise ValueError("Запись не содержит source_ticket_id")
        ticket_groups[tid].append(record)

    # Стабильная сортировка и детерминированное перемешивание
    unique_tickets = sorted(ticket_groups.keys())
    rng = random.Random(seed)
    rng.shuffle(unique_tickets)

    n_tickets = len(unique_tickets)
    n_train = int(round(n_tickets * train_ratio))
    n_val = int(round(n_tickets * val_ratio))

    train_tickets = set(unique_tickets[:n_train])
    val_tickets = set(unique_tickets[n_train : n_train + n_val])
    holdout_tickets = set(unique_tickets[n_train + n_val :])

    train_records: list[dict[str, Any]] = []
    val_records: list[dict[str, Any]] = []
    holdout_records: list[dict[str, Any]] = []

    for tid, recs in ticket_groups.items():
        if tid in train_tickets:
            train_records.extend(recs)
        elif tid in val_tickets:
            val_records.extend(recs)
        elif tid in holdout_tickets:
            holdout_records.extend(recs)


    return DatasetSplit(
        train=train_records,
        val=val_records,
        holdout=holdout_records,
    )
