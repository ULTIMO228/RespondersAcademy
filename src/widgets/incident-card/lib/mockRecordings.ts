import { MOCK_RECORDING_DURATIONS_MS } from "../config/constants";

export type CallRecording = {
  id: string;
  at: string;
  phone: string;
  durationMs: number;
};

type RecordingSource = { id: string; createdAt: string; phones: { aon: string } };

/** Мок-записи разговоров по АОН карточки; без АОН записей нет («Записей не найдено»). */
export function buildMockRecordings(card: RecordingSource): CallRecording[] {
  if (!card.phones.aon) return [];
  return MOCK_RECORDING_DURATIONS_MS.map((durationMs, index) => ({
    id: `${card.id}-rec-${index + 1}`,
    at: card.createdAt,
    phone: card.phones.aon,
    durationMs,
  }));
}
