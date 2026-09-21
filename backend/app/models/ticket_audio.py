from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

AUDIO_STATUSES = ("pending", "ready", "failed")


class TicketAudio(Base):
    """Аудиозапись обращения заявителя по билету (TicketAudio контракта v1; FR-012/013)."""

    __tablename__ = "ticket_audio"

    card_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    path: Mapped[str | None] = mapped_column(String(600), nullable=True)
    transcript: Mapped[str] = mapped_column(String(4000), default="")
    voice: Mapped[str] = mapped_column(String(16), default="male")
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    error: Mapped[str | None] = mapped_column(String(600), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="template")  # template | gateway — кто дал текст реплики

    def to_contract(self, *, emergency: bool | None = None) -> dict[str, Any]:
        data: dict[str, Any] = {"cardId": self.card_id, "status": self.status, "transcript": self.transcript, "voice": self.voice}
        if self.path and self.status == "ready":
            data["path"] = self.path
        if self.duration_ms is not None:
            data["durationMs"] = self.duration_ms
        if self.generated_at:
            data["generatedAt"] = self.generated_at
        if self.error:
            data["error"] = self.error
        # Аварийный режим (FR-013): аудио нет — фронт показывает расшифровку с пометкой.
        data["emergency"] = bool(emergency) if emergency is not None else self.status != "ready"
        return data
