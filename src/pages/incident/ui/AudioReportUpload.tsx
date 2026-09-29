"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/shared/ui";

import styles from "./IncidentPage.module.css";

type AudioResult = {
  call: { transcript?: Array<{ text: string }> };
  recording: { url: string };
};

/** Загрузка доклада курсанта в локальный STT; в режиме фронтового мока панель скрыта. */
export function AudioReportUpload({ attemptId }: { attemptId: string }) {
  const [available, setAvailable] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<AudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/health", { signal: controller.signal, credentials: "same-origin", cache: "no-store" })
      .then((response) => setAvailable(response.ok))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/v1/attempts/${encodeURIComponent(attemptId)}/report-audio`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? `Ошибка загрузки (${response.status})`);
      }
      setResult((await response.json()) as AudioResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить доклад");
    } finally {
      setUploading(false);
    }
  }

  if (!available) return null;
  return (
    <section className={styles.page__audioReport} aria-label="Аудиодоклад ДДС">
      <h2>Аудиодоклад ДДС</h2>
      <p>
        Загрузите WAV: моно, PCM 16 бит, 8 или 16 кГц. Доклад распознаётся локально и попадёт в записи
        карточки.
      </p>
      <form onSubmit={submit}>
        <input
          aria-label="WAV доклада"
          type="file"
          accept=".wav,audio/wav"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button type="submit" size="sm" disabled={!file || uploading}>
          {uploading ? "Распознаём…" : "Отправить доклад"}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <div role="status">
          <p>Доклад сохранён. Распознано: {result.call.transcript?.[0]?.text ?? "—"}</p>
          <audio controls preload="none" src={result.recording.url} aria-label="Прослушать аудиодоклад" />
        </div>
      ) : null}
    </section>
  );
}
