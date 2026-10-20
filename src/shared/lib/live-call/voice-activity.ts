/** Выделяет реплики из непрерывного PCM, сохраняя начало слова перед срабатыванием порога. */
export type VoiceActivityOptions = {
  sampleRate: number;
  onStart: () => void;
  onEnd: () => void;
  onUtterance: (samples: Float32Array) => void;
};

export function createVoiceActivity(options: VoiceActivityOptions) {
  let preRoll: Float32Array[] = [];
  let chunks: Float32Array[] = [];
  let hotMs = 0;
  let voicedMs = 0;
  let quietMs = 0;
  let totalMs = 0;
  let active = false;
  let noise = 0.001;
  const reset = () => {
    preRoll = [];
    chunks = [];
    hotMs = voicedMs = quietMs = totalMs = 0;
    active = false;
  };
  const end = () => {
    const valid = voicedMs >= 180;
    const samples = new Float32Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    reset();
    options.onEnd();
    if (valid) options.onUtterance(samples);
  };
  return {
    reset,
    push(frame: Float32Array) {
      const ms = (frame.length / options.sampleRate) * 1000;
      const rms = Math.sqrt(frame.reduce((sum, value) => sum + value * value, 0) / Math.max(1, frame.length));
      const voiced = rms > Math.max(0.008, noise * 3);
      if (!active) {
        if (!voiced) noise = Math.min(0.01, noise * 0.98 + rms * 0.02);
        preRoll.push(frame.slice());
        while (preRoll.length > Math.ceil(350 / ms)) preRoll.shift();
        hotMs = voiced ? hotMs + ms : 0;
        if (hotMs < 80) return rms;
        active = true;
        chunks = preRoll;
        preRoll = [];
        voicedMs = hotMs;
        totalMs = chunks.length * ms;
        options.onStart();
        return rms;
      }
      chunks.push(frame.slice());
      totalMs += ms;
      if (voiced) {
        voicedMs += ms;
        quietMs = 0;
      } else quietMs += ms;
      if (quietMs >= 1000 || totalMs >= 20_000) end();
      return rms;
    },
  };
}
