import { createPcmPlayback } from "./playback";

const WORKLET = `
class RealtimeMicrophone extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(320); this.offset = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.buffer[this.offset++] = value;
      if (this.offset === 320) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(320); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('realtime-microphone', RealtimeMicrophone);`;

export type Duplex = ReturnType<typeof createDuplex>;
export function createDuplex(options: {
  onAudio: (encoded: string) => void;
  onLevel: (level: number) => void;
  onError: (error: Error) => void;
}) {
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let silent: GainNode | null = null;
  let playback: ReturnType<typeof createPcmPlayback> | null = null;
  let stopped = false;
  let transmitting = false;
  let muted = false;
  const stop = () => {
    stopped = true;
    transmitting = false;
    playback?.stop();
    if (processor) processor.port.onmessage = null;
    processor?.disconnect();
    source?.disconnect();
    silent?.disconnect();
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  };
  return {
    async prepare() {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined")
        throw new Error("Микрофон доступен в Chrome/Edge по HTTPS или localhost");
      context = new AudioContext({ sampleRate: 16000 });
      const resumed = context.resume();
      void resumed.catch(() => undefined);
      try {
        const captured = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (stopped) {
          captured.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = captured;
        await resumed;
        if (stopped) return;
        if (context.sampleRate !== 16000 || !context.audioWorklet)
          throw new Error("Браузер не поддерживает потоковый звук 16 кГц. Откройте Chrome/Edge");
        playback = createPcmPlayback(context);
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
        try {
          await context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (stopped) return;
        source = context.createMediaStreamSource(stream);
        processor = new AudioWorkletNode(context, "realtime-microphone");
        let frames = 0;
        processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (stopped || !transmitting) return;
          const samples = event.data;
          const pcm = new Uint8Array(samples.length * 2);
          const view = new DataView(pcm.buffer);
          let energy = 0;
          samples.forEach((value, index) => {
            const sample = muted ? 0 : Math.max(-1, Math.min(1, value));
            energy += sample * sample;
            view.setInt16(index * 2, sample * (sample < 0 ? 32768 : 32767), true);
          });
          options.onAudio(btoa(String.fromCharCode(...pcm)));
          if (++frames % 5 === 0) options.onLevel(Math.min(1, Math.sqrt(energy / samples.length) * 8));
        };
        const lost = () => {
          stop();
          options.onError(new Error("Микрофон отключён. Подключитесь повторно"));
        };
        processor.onprocessorerror = lost;
        stream.getTracks().forEach((track) => {
          track.onended = lost;
        });
        silent = context.createGain();
        silent.gain.value = 0;
        source.connect(processor);
        processor.connect(silent);
        silent.connect(context.destination);
      } catch (error) {
        stop();
        if (error instanceof Error && error.name === "NotAllowedError")
          throw new Error("Разрешите доступ к микрофону в браузере");
        throw error;
      }
    },
    transmit() {
      transmitting = !stopped;
    },
    mute(value: boolean) {
      muted = value;
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = !value;
      });
      if (value) options.onLevel(0);
    },
    begin: (id: string) => playback?.begin(id),
    committed: () => playback?.committed(),
    speechStarted: () => playback?.speechStarted() ?? [],
    speechStopped: () => playback?.speechStopped(),
    play: (id: string, itemId: string | undefined, audio: string) => playback?.push(id, itemId, audio),
    done: (id: string) => playback?.done(id),
    stop,
  };
}
