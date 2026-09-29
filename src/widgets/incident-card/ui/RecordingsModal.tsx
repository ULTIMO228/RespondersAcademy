"use client";

import { formatDateTime } from "@/shared/lib";
import { Button } from "@/shared/ui";

import type { RecordingView } from "../model/useRecordings";
import { DraggableWindow } from "./DraggableWindow";

import styles from "./RecordingsModal.module.css";

type RecordingsModalProps = {
  /** null — загрузка. */
  recordings: RecordingView[] | null;
  error?: string | null;
  onClose: () => void;
};

const WINDOW_WIDTH = 560;
const MOCK_AUDIO_TITLE = "Прослушивание и скачивание аудио — этап 2";

/** Окно «Записи разговоров» (spec п. 13): записи с длительностью мм:сс или «Записей не найдено»; перетаскивается. */
export function RecordingsModal({ recordings, error, onClose }: RecordingsModalProps) {
  return (
    <DraggableWindow title="Записи разговоров" onClose={onClose} width={WINDOW_WIDTH}>
      {recordings === null ? <p className={styles.recordings__empty}>Загрузка…</p> : null}
      {recordings?.length === 0 ? <p className={styles.recordings__empty}>Записей не найдено</p> : null}
      {recordings && recordings.length > 0 ? (
        <ul className={styles.recordings}>
          {recordings.map((recording) => (
            <li key={recording.id} className={styles.recordings__item}>
              <span>{formatDateTime(recording.at)}</span>
              <span>{recording.title}</span>
              <span className={styles.recordings__duration}>{recording.duration}</span>
              {recording.audioUrl ? (
                <div className={styles.recordings__actions}>
                  <audio
                    controls
                    preload="none"
                    src={recording.audioUrl}
                    aria-label={`Прослушать ${recording.title}`}
                  />
                  <a
                    className={styles.recordings__download}
                    href={recording.audioUrl}
                    download={`${recording.id}.wav`}
                  >
                    скачать
                  </a>
                </div>
              ) : (
                <div className={styles.recordings__actions}>
                  <Button size="sm" disabled title={MOCK_AUDIO_TITLE}>
                    прослушать
                  </Button>
                  <Button size="sm" disabled title={MOCK_AUDIO_TITLE}>
                    скачать
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className={styles.recordings__note} role="alert">
          {error}
        </p>
      ) : null}
    </DraggableWindow>
  );
}
