"""Подключить демо-MP3 к билетам после загрузки сида.

Файлы находятся в backend/data/demo_audio; запустите:
uv run python scripts/install_demo_recordings.py
"""

from __future__ import annotations

import asyncio
import os
import secrets
from pathlib import Path

from app.db.session import get_sessionmaker
from app.models.card import IncidentCard
from app.models.ticket_audio import TicketAudio
from app.services.time import now_iso

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
BACKEND_DIR = Path(__file__).resolve().parents[1]

RECORDINGS = {
    "c-010": (
        "female",
        "Алло! Это сто двенадцать? Я стою на улице... у нас пожар! На тринадцатом этаже жилого дома "
        "горит балкон и два окна, видно открытое пламя! Дом четырнадцатиэтажный, газифицированный. "
        "Пожалуйста, приезжайте скорее! Москва, улица Грина, дом одиннадцать. Меня зовут Сидорова "
        "Анна Викторовна. Мой телефон: девятьсот шестнадцать, сто двадцать шесть, тридцать четыре, "
        "семьдесят один.",
    ),
    "c-049": (
        "male",
        "Алло, здравствуйте! Это служба сто двенадцать? У нас в жилом доме сработала пожарная "
        "сигнализация. Дыма и огня я не вижу, но сигнализация всё ещё работает. Адрес: Москва, "
        "Большой Сухаревский переулок, дом девятнадцать, строение два, первый подъезд. Код домофона — "
        "две тысячи двести пятнадцать. Меня зовут Сухов Леонид Сергеевич. Мой номер: девятьсот "
        "шестнадцать, сто двадцать три, девяносто восемь, семьдесят восемь. Пожалуйста, проверьте, "
        "что происходит!",
    ),
    "c-050": (
        "female",
        "Алло, срочно нужна скорая! Мы в магазине «Лента», у касс. Мужчина лет сорока — сорока пяти "
        "упал, у него судороги и пена изо рта! При падении он разбил голову. Адрес: Москва, улица "
        "Твардовского, владение два, корпуса один и два, магазин «Лента», у касс. Меня зовут Соколова "
        "Вера Ивановна. Мой телефон: девятьсот шестнадцать, триста двадцать, двенадцать, восемьдесят "
        "три. Пожалуйста, приезжайте быстрее!",
    ),
}

MPEG1_LAYER3_BITRATES = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)


def mp3_duration_ms(path: Path) -> int:
    """Длительность CBR MP3 ElevenLabs без внешнего декодера."""
    with path.open("rb") as stream:
        tag = stream.read(10)
        offset = 0
        if tag.startswith(b"ID3"):
            offset = 10 + sum((tag[6 + i] & 0x7F) << (21 - 7 * i) for i in range(4))
        stream.seek(offset)
        header_bytes = stream.read(4)
    if len(header_bytes) != 4:
        raise ValueError(f"Пустой или повреждённый MP3: {path}")
    header = int.from_bytes(header_bytes, "big")
    bitrate_index = (header >> 12) & 0xF
    if (header >> 21) & 0x7FF != 0x7FF or (header >> 19) & 3 != 3 or (header >> 17) & 3 != 1 or bitrate_index not in range(1, 15):
        raise ValueError(f"Ожидался MPEG-1 Layer III CBR: {path}")
    bitrate = MPEG1_LAYER3_BITRATES[bitrate_index] * 1000
    return round((path.stat().st_size - offset) * 8000 / bitrate)


async def install(audio_dir: Path) -> list[tuple[str, int]]:
    prepared: dict[str, tuple[Path, int]] = {}
    for card_id in RECORDINGS:
        path = (audio_dir / f"{card_id}-elevenlabs.mp3").resolve()
        prepared[card_id] = (path, mp3_duration_ms(path))

    async with get_sessionmaker()() as db:
        for card_id in RECORDINGS:
            if await db.get(IncidentCard, card_id) is None:
                raise ValueError(f"Билет {card_id} отсутствует: сначала загрузите сид")
        for card_id, (voice, transcript) in RECORDINGS.items():
            path, duration_ms = prepared[card_id]
            row = await db.get(TicketAudio, card_id)
            if row is None:
                row = TicketAudio(card_id=card_id)
                db.add(row)
            row.path = str(path)
            row.transcript = transcript
            row.voice = voice
            row.source = "elevenlabs"
            row.duration_ms = duration_ms
            row.generated_at = now_iso()
            row.status = "ready"
            row.error = None
        await db.commit()
    return [(card_id, prepared[card_id][1]) for card_id in RECORDINGS]


if __name__ == "__main__":
    for card_id, duration_ms in asyncio.run(install(BACKEND_DIR / "data" / "demo_audio")):
        print(f"{card_id}: готово ({duration_ms / 1000:.1f} с)")
