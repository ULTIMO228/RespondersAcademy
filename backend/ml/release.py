"""Жизненный цикл ModelRelease и правила допуска release-gates (T050, T049)."""

from dataclasses import dataclass
from enum import StrEnum


class ReleaseStatus(StrEnum):
    CANDIDATE = "candidate"

    ACCEPTED = "accepted"
    REJECTED = "rejected"
    ARCHIVED = "archived"


@dataclass
class ModelRelease:
    id: str
    base_model_revision: str
    adapter_revision: str | None
    runtime_revision: str
    dataset_hash: str
    prompt_version: str
    eval_run_id: str
    artifact_hash: str
    disk_bytes: int
    status: ReleaseStatus
    quantization: str | None = None


@dataclass(frozen=True)
class ReleaseGateReport:
    manifest_approved: bool
    sanitized_sources_pct: float
    schema_validity_pct: float
    timeout_loop_pct: float
    hallucinated_codes_count: int
    missed_critical_errors_count: int
    operator112_f1_delta: float
    dds_f1_delta: float
    independent_judge_confirmed: bool
    prompt_repetitions: int
    cpu_budget_approved: bool
    cpu_p95_ms: int
    max_cpu_budget_ms: int | None
    peak_ram_mb: int
    max_ram_budget_mb: int | None


def evaluate_release_gates(report: ReleaseGateReport) -> ReleaseStatus:
    """Оценивает соблюдение 10 обязательных условий допуска из release-gates.md."""
    # 1. Манифест до прогона заполнен и утвержден
    if not report.manifest_approved:
        return ReleaseStatus.REJECTED

    # 2. 100% источников прошли деперсонализацию и утверждение
    if report.sanitized_sources_pct < 100.0:
        return ReleaseStatus.REJECTED

    # 3. Валидный полный ответ >= 95%
    if report.schema_validity_pct < 95.0:
        return ReleaseStatus.REJECTED

    # 4. Цикл, таймаут или обрыв <= 1%
    if report.timeout_loop_pct > 1.0:
        return ReleaseStatus.REJECTED

    # 5. Выдуманные коды ЕКП/адреса = 0
    if report.hallucinated_codes_count > 0:
        return ReleaseStatus.REJECTED

    # 6. Пропущенные критические ошибки = 0
    if report.missed_critical_errors_count > 0:
        return ReleaseStatus.REJECTED

    # 7. Качество по обоим режимам не ниже baseline
    if report.operator112_f1_delta < 0.0 or report.dds_f1_delta < 0.0:
        return ReleaseStatus.REJECTED

    # 8. Независимое подтверждение судьей иной семьи
    if not report.independent_judge_confirmed:
        return ReleaseStatus.REJECTED

    # 9. Воспроизводимость промпта (>= 3 повтора)
    if report.prompt_repetitions < 3:
        return ReleaseStatus.REJECTED

    # 10. Числовой CPU-бюджет утверждён и соблюдён
    if not report.cpu_budget_approved or report.max_cpu_budget_ms is None:
        return ReleaseStatus.REJECTED
    if report.cpu_p95_ms > report.max_cpu_budget_ms:
        return ReleaseStatus.REJECTED
    if report.max_ram_budget_mb is not None and report.peak_ram_mb > report.max_ram_budget_mb:
        return ReleaseStatus.REJECTED

    return ReleaseStatus.ACCEPTED


_ACTIVE_RELEASE: ModelRelease | None = None


def activate_release(release: ModelRelease) -> ModelRelease:
    """Активирует релиз для использования в занятии. Разрешено только для accepted."""
    global _ACTIVE_RELEASE
    if release.status != ReleaseStatus.ACCEPTED:
        raise ValueError(f"Активация запрещена: статус релиза {release.status}, требуется accepted")
    _ACTIVE_RELEASE = release
    return release


def get_active_release() -> ModelRelease | None:
    """Возвращает текущий активный принятый релиз модели."""
    global _ACTIVE_RELEASE
    return _ACTIVE_RELEASE


def reset_active_release() -> None:
    """Сбрасывает активный релиз (для тестов)."""
    global _ACTIVE_RELEASE
    _ACTIVE_RELEASE = None
