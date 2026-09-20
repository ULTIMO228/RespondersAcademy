"use client";

import { useEffect, useState } from "react";

import { getCardRecordings } from "@/shared/api";
import type { CardRecording } from "@/shared/api";
import { formatDurationPadded } from "@/shared/lib";

import { buildMockRecordings } from "../lib/mockRecordings";

/** Строка модалки «Записи разговоров»: длительность — «мм:сс». */
export type RecordingView = { id: string; at: string; title: string; duration: string };

type RecordingSource = { id: string; createdAt: string; phones: { aon: string } };

function fromApi(recording: CardRecording): RecordingView {
  const { id, startedAt, title, duration } = recording;
  return { id, at: startedAt, title, duration };
}

/** Прототип / просмотр преподавателем: мок-записи по АОН (без обращения к API). */
export function buildLocalRecordings(card: RecordingSource): RecordingView[] {
  return buildMockRecordings(card).map((recording) => ({
    id: recording.id,
    at: recording.at,
    title: recording.phone,
    duration: formatDurationPadded(recording.durationMs),
  }));
}

/** Живой режим: GET /api/mock/cards/[id]/recordings (в моках записей нет → «Записей не найдено»). */
export function useRecordings(card: RecordingSource, isLive: boolean) {
  const [recordings, setRecordings] = useState<RecordingView[] | null>(() =>
    isLive ? null : buildLocalRecordings(card),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive) return undefined;
    const controller = new AbortController();
    getCardRecordings(card.id, controller.signal)
      .then((list) => setRecordings(list.map(fromApi)))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setRecordings([]);
      });
    return () => controller.abort();
  }, [card.id, isLive]);

  return { recordings, error };
}
