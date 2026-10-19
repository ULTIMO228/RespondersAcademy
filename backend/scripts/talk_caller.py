"""Диалог с ИИ-заявителем в терминале: печатаете реплики оператора, заявитель отвечает текстом и голосом.

Из backend/ (нужны POLZA_API_KEY и LIVE_CALL_POLZA_* в backend/.env; запросы платные):
  uv run python -m scripts.talk_caller [--card c-010] [--tags] [--no-audio]

  --card      билет из БД (DATABASE_URL); без него — синтетический пожар
  --tags      показывать метки настроения и звуков (для отладки персоны)
  --no-audio  без озвучки, только текст (быстрее и дешевле)

Озвучка каждой реплики сохраняется в var/talk-caller/NN.wav и, если есть плеер
(afplay на macOS, aplay/paplay на Linux), сразу проигрывается. Пустая строка или
«выход» — конец разговора; транскрипт сохраняется в var/talk-caller/dialogue.json.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import time

import httpx

from app.api.errors import ApiError
from app.config import get_settings
from app.services import caller_persona as persona
from app.services import realtime_call_service as call
from app.services.live_caller_provider import FACT_KEYS
from app.services.realtime_cascade import stream_reply
from app.services.realtime_polza import PolzaSession

SYNTHETIC = {"summary": "Горит балкон на 13 этаже жилого дома, видно открытое пламя, дом газифицирован",
             "address": "Москва, улица Грина, дом 11",
             "caller": {"name": "Сидорова Анна Викторовна", "phone": "916-126-34-71", "status": "соседка"}}
START = ("Соединение установлено. Начни звонок как заявитель: коротко поздоровайся и своими словами "
         "попроси помощь по происшествию. Не перечисляй адрес и контакты заранее.")


async def card_facts(card_id: str) -> dict:
    from app.db.session import get_sessionmaker
    from app.models.card import IncidentCard

    async with get_sessionmaker()() as db:
        card = await db.get(IncidentCard, card_id)
        if card is None:
            raise SystemExit(f"Билет {card_id} не найден в БД ({get_settings().resolved_database_url})")
        ticket = card.to_contract()
    return {key: ticket[key] for key in FACT_KEYS if key in ticket}


def player() -> list[str] | None:
    for command in (["afplay"], ["paplay"], ["aplay", "-q"]):
        if shutil.which(command[0]):
            return command
    return None


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--card")
    parser.add_argument("--tags", action="store_true")
    parser.add_argument("--no-audio", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    missing = [name.upper() for name in ("polza_api_key", "live_call_polza_chat_model")
               + (() if args.no_audio else ("live_call_polza_tts_model",)) if not getattr(settings, name)]
    if missing:
        print("Задайте в backend/.env: " + ", ".join(missing), file=sys.stderr)
        return 2

    facts = await card_facts(args.card) if args.card else SYNTHETIC
    out = settings.var_dir / "talk-caller"
    out.mkdir(parents=True, exist_ok=True)
    play = None if args.no_audio else player()
    session = PolzaSession()
    session.client = httpx.AsyncClient(timeout=httpx.Timeout(settings.polza_timeout_sec, connect=10))
    created = {"session": {"capabilities": {"turn_detection": ["server_vad"]}}}
    system = call.session_update(created, facts, persona.STYLE)["session"]["instructions"] + "\n" + session.reply_rules()
    history: list[dict[str, str]] = []
    transcript: list[dict[str, str]] = []
    print(f"Модель: {settings.live_call_polza_chat_model} | голос: {settings.live_call_polza_tts_model or 'выкл'}")
    print("Билет: " + json.dumps(facts, ensure_ascii=False))
    print("Пустая строка или «выход» — конец.\n")

    async def caller_turn(prompt: str, turn: int) -> None:
        messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": prompt}]
        started, first, raw = time.monotonic(), None, ""
        shown = persona.TagFilter()
        print("Заявитель: ", end="", flush=True)
        async for delta in stream_reply(messages, session.client, session.llm_endpoint(), session.llm_options()):
            first = first or time.monotonic() - started
            raw += delta
            print(delta if args.tags else shown.feed(delta), end="", flush=True)
        print("" if args.tags else shown.flush())
        llm_sec = time.monotonic() - started
        history.extend([{"role": "user", "content": prompt}, {"role": "assistant", "content": raw}])
        transcript.append({"speaker": "caller", "text": persona.strip_tags(raw)})
        timing = f"первое слово {first or 0:.1f} с, ответ {llm_sec:.1f} с"
        if not args.no_audio:
            started = time.monotonic()
            phrases: asyncio.Queue = asyncio.Queue()
            for item in (raw, None):
                await phrases.put(item)
            audio = b"".join([chunk async for chunk in session.synthesize(phrases)])
            path = out / f"{turn:02}.wav"
            path.write_bytes(persona.pcm16_to_wav(audio, persona.SAMPLE_RATE))
            timing += f", голос {time.monotonic() - started:.1f} с [{session.mood}] → {path.name}"
            if play:
                await asyncio.to_thread(subprocess.run, [*play, str(path)], check=False)
        print(f"   ({timing})\n")

    async def safe_turn(prompt: str, turn: int) -> None:
        try:
            await caller_turn(prompt, turn)
        except ApiError as exc:
            # Ошибка провайдера (ключ, баланс, модель) — понятное сообщение, разговор продолжается.
            print(f"\n   ⚠️ {exc.message}\n")

    try:
        await safe_turn(START, 0)
        turn = 1
        while True:
            line = (await asyncio.to_thread(input, "Оператор: ")).strip()
            if not line or line.lower() in {"выход", "exit", "quit"}:
                break
            transcript.append({"speaker": "dispatcher", "text": line})
            await safe_turn(line, turn)
            turn += 1
    except (EOFError, KeyboardInterrupt):
        pass
    finally:
        await session.client.aclose()
        (out / "dialogue.json").write_text(json.dumps({"facts": facts, "transcript": transcript},
                                                      ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nТранскрипт: {out / 'dialogue.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
