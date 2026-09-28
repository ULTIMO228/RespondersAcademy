/*
 * Блок «Вызовы» попытки (spec/000-фронт/04-pages/13 п. 3, критерий «транскрипт виден преподавателю и в отчёте»):
 * номер точки C, длительность разговора и транскрипт реплик из CardEvent.calls.
 */
import type { CardEventContract, TranscriptSpeaker } from "@/shared/api";
import { formatDurationPadded, formatTime } from "@/shared/lib";

import type { CallView } from "../model/types";

const SPEAKER_TITLES: Record<TranscriptSpeaker, string> = {
  dispatcher: "Диспетчер",
  ai: "Абонент (ИИ)",
};

const UNKNOWN_DURATION = "—";

function formatCallDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return UNKNOWN_DURATION;
  return formatDurationPadded(Date.parse(endedAt) - Date.parse(startedAt));
}

export function buildCalls(attempt: CardEventContract): CallView[] {
  return attempt.calls.map((call, index) => ({
    id: call.id ?? `${attempt.id}-call-${index}`,
    toNumber: call.toNumber,
    duration: formatCallDuration(call.startedAt, call.endedAt),
    transcript: call.transcript.map((line, lineIndex) => ({
      id: `${attempt.id}-call-${index}-line-${lineIndex}`,
      speakerTitle: SPEAKER_TITLES[line.speaker] ?? line.speaker,
      text: line.text,
      at: formatTime(line.at),
    })),
  }));
}
