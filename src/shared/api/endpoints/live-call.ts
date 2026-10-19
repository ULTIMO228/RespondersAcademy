import { v1ApiClient } from "../v1-client";

export type LiveTranscriptLine = {
  speaker: "dispatcher" | "caller";
  text: string;
  at: string;
  turnId: string;
};
export type LiveCallRecord = {
  id?: string;
  status: "idle" | "active" | "ended";
  startedAt?: string;
  endedAt?: string;
  maxDurationSec?: number;
  transcript: LiveTranscriptLine[];
};

const path = (attemptId: string) => `/operator112/attempts/${encodeURIComponent(attemptId)}/live-call`;
export const liveCallApi = {
  read: (id: string) => v1ApiClient.get<LiveCallRecord>(path(id)),
  start: (id: string) => v1ApiClient.post<LiveCallRecord>(path(id)),
  turn: (id: string, turnId: string, audio: Blob) => {
    const form = new FormData();
    form.append("turnId", turnId);
    form.append("file", audio, "turn.wav");
    return v1ApiClient.postForm<LiveCallRecord>(`${path(id)}/turn`, form);
  },
  audio: (id: string, turnId: string) =>
    v1ApiClient.getBlob(`${path(id)}/audio/${encodeURIComponent(turnId)}`),
  finish: (id: string) => v1ApiClient.post<LiveCallRecord>(`${path(id)}/finish`),
};
