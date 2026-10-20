type Playing = {
  itemId?: string;
  start: number;
  end: number;
  samples: number;
  nodes: Set<AudioBufferSourceNode>;
};

/** PCM16 LE, без файлов, Blob URL и ожидания полного ответа. */
export function createPcmPlayback(context: AudioContext) {
  const playing = new Map<string, Playing>();
  const rejected = new Set<string>();
  // Перебивание заявителя: звучит, пока оператор ещё говорит.
  const overlapping = new Set<string>();
  let current: string | null = null;
  let userSpeaking = false;
  const pending: { interrupted: boolean }[] = [];
  let nextTime = 0;

  const clear = () => {
    playing.forEach((entry) => entry.nodes.forEach((node) => node.stop()));
    playing.clear();
    nextTime = 0;
  };
  return {
    committed() {
      pending.push({ interrupted: false });
    },
    begin(id: string, interrupting = false) {
      current = id;
      if (interrupting) {
        overlapping.add(id);
        return;
      }
      const waiting = pending.shift();
      if (userSpeaking || waiting?.interrupted) rejected.add(id);
    },
    speechStarted() {
      userSpeaking = true;
      pending.forEach((turn) => {
        turn.interrupted = true;
      });
      if (current) rejected.add(current);
      const truncated = [...playing.entries()].map(([id, entry]) => {
        rejected.add(id);
        return {
          itemId: entry.itemId,
          milliseconds: Math.floor(
            Math.max(0, Math.min(context.currentTime, entry.end) - entry.start) * 1000,
          ),
        };
      });
      clear();
      return truncated;
    },
    speechStopped() {
      userSpeaking = false;
    },
    push(id: string, itemId: string | undefined, encoded: string) {
      if (id !== current || rejected.has(id) || (userSpeaking && !overlapping.has(id))) return;
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      if (bytes.length % 2) throw new Error("Некорректный поток звука");
      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(bytes.length / 2);
      for (let index = 0; index < samples.length; index++)
        samples[index] = view.getInt16(index * 2, true) / 32768;
      if (!samples.length) return;
      const start = Math.max(context.currentTime + 0.025, nextTime);
      if (start - context.currentTime > 15) throw new Error("Переполнен буфер голосового ответа");
      const entry = playing.get(id) ?? {
        itemId,
        start,
        end: start,
        samples: 0,
        nodes: new Set<AudioBufferSourceNode>(),
      };
      const buffer = context.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      node.onended = () => {
        entry.nodes.delete(node);
        node.disconnect();
      };
      entry.nodes.add(node);
      entry.samples += samples.length;
      entry.end = start + buffer.duration;
      playing.set(id, entry);
      nextTime = entry.end;
      node.start(start);
    },
    done(id: string) {
      if (current === id) current = null;
      // Завершённая генерация ещё может звучать: сохраняем время для truncate.
      for (const [key, entry] of playing) if (!entry.nodes.size) playing.delete(key);
      rejected.delete(id);
      overlapping.delete(id);
    },
    stop() {
      clear();
      rejected.clear();
      overlapping.clear();
      current = null;
      pending.length = 0;
    },
  };
}
