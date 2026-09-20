/*
 * Звуковой сигнал новой карточки (опционально, spec/04-pages/01-arm-main.md «Поступление новой карточки»).
 * За интерфейсом: в тестах подменяется; реализация — короткий тон Web Audio (без внешних ассетов и сети).
 * Браузер может запретить звук до первого действия пользователя — тогда сигнал молча пропускается.
 */
export interface SoundPlayer {
  play(): void;
}

const TONE_HZ = 880;
const TONE_SECONDS = 0.18;
const TONE_GAIN = 0.08;

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext;
}

export function createBeepPlayer(): SoundPlayer {
  let context: AudioContext | null = null;
  return {
    play() {
      try {
        const AudioContextClass = resolveAudioContext();
        if (!AudioContextClass) return;
        context ??= new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = TONE_HZ;
        gain.gain.value = TONE_GAIN;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + TONE_SECONDS);
      } catch {
        // звук необязателен: без Web Audio лента работает только с визуальным сигналом
      }
    },
  };
}

export const silentPlayer: SoundPlayer = { play: () => undefined };
