"""Один worker с прогретыми локальными голосовыми моделями: python -m scripts.run_voice_demo."""
import uvicorn

from app.config import get_settings


def main():
    settings = get_settings()
    if settings.live_calls_enabled and settings.live_call_realtime_transport == "cascade":
        from app.services.realtime_cascade import warmup
        warmup()
        print("Локальные голосовые модели готовы", flush=True)
    elif settings.live_calls_enabled and settings.live_call_realtime_transport == "speechkit":
        from ml.speech.vad import SpeechDetector
        SpeechDetector()
        print("SpeechKit выбран; локальный детектор перебиваний готов", flush=True)
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, workers=1, access_log=False)


if __name__ == "__main__":
    main()
