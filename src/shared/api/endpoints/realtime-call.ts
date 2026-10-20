import { v1ApiClient } from "../v1-client";

export type RealtimeEvent = {
  type: string;
  response_id?: string;
  /** interrupting — заявитель перебивает оператора, звук идёт поверх его речи. */
  response?: { id?: string; status?: string; interrupting?: boolean };
  item_id?: string;
  delta?: string;
  transcript?: string;
  message?: string;
};
export type RealtimeConnection = {
  sendAudio(pcm: string): void;
  truncate(itemId: string, milliseconds: number): void;
  close(): void;
};

export const realtimeCallApi = {
  status: () => v1ApiClient.get<{ configured: boolean }>("/operator112/realtime/status"),
  ticket: (attemptId: string) =>
    v1ApiClient.post<{ url: string; ticket: string }>(
      `/operator112/attempts/${encodeURIComponent(attemptId)}/realtime`,
    ),
  connect(
    access: { url: string; ticket: string },
    onEvent: (event: RealtimeEvent) => void,
    onClose: () => void,
  ): RealtimeConnection {
    const socket = new WebSocket(access.url);
    let closed = false;
    let ready = false;
    const timer = setTimeout(() => {
      onEvent({ type: "error", message: "Голосовой сервер не ответил. Повторите подключение." });
      socket.close();
    }, 45000);
    socket.onopen = () => {
      if (!closed) socket.send(JSON.stringify({ ticket: access.ticket }));
    };
    socket.onmessage = (message) => {
      if (closed) return;
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        if (event.type === "ready") {
          ready = true;
          clearTimeout(timer);
        }
        onEvent(event);
      } catch {
        onEvent({ type: "error", message: "Некорректный ответ голосового сервера" });
        socket.close();
      }
    };
    socket.onerror = () => {
      if (!closed) onEvent({ type: "error", message: "Нет соединения с голосовым сервером" });
    };
    socket.onclose = () => {
      clearTimeout(timer);
      if (!closed) onClose();
    };
    const send = (event: object) => {
      if (closed || !ready || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 128000) {
        onEvent({ type: "error", message: "Сеть не успевает передавать голос. Подключитесь повторно." });
        socket.close();
        return;
      }
      socket.send(JSON.stringify(event));
    };
    return {
      sendAudio: (audio) => send({ type: "input_audio_buffer.append", audio }),
      truncate: (item_id, audio_end_ms) =>
        send({ type: "conversation.item.truncate", item_id, content_index: 0, audio_end_ms }),
      close() {
        closed = true;
        clearTimeout(timer);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "finish" }));
          socket.close();
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      },
    };
  },
};
