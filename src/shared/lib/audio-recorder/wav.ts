/*
 * Кодирование записи в WAV, который принимает бэкенд (backend/ml/speech/stt.py): моно, PCM 16 бит, 8 или 16 кГц, ≤ 20 МБ.
 * Чистые функции без браузерных API — проверяются тестами на данных.
 */

export const TARGET_SAMPLE_RATE = 16_000;
export const MAX_RECORDING_SEC = 180;
const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

/** Каналы → моно (среднее). */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels)
    for (let index = 0; index < length; index += 1) mono[index] += channel[index];
  for (let index = 0; index < length; index += 1) mono[index] /= channels.length;
  return mono;
}

/** Линейная передискретизация до targetRate (речь для распознавания; фильтр НЧ не нужен при понижении с 44,1/48 кГц). */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const out = new Float32Array(length);
  const ratio = fromRate / toRate;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    out[index] = samples[left] + (samples[right] - samples[left]) * (position - left);
  }
  return out;
}

function writeText(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

/** WAV PCM 16 бит моно: 44-байтный заголовок + отсчёты, ограниченные диапазоном [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true); // размер блока fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // байт/с
  view.setUint16(32, BYTES_PER_SAMPLE, true); // выравнивание блока
  view.setUint16(34, 16, true); // бит на отсчёт
  writeText(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  });
  return new Blob([buffer], { type: "audio/wav" });
}

/** Каналы любой частоты → WAV моно 16 кГц 16 бит. */
export function toReportWav(channels: readonly Float32Array[], sampleRate: number): Blob {
  return encodeWav(resample(mixToMono(channels), sampleRate, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
}
