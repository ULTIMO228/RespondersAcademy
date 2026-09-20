"use client";

import { useState } from "react";

import { formatDate, systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";
import { Button } from "@/shared/ui";

import { createBrowserFileSaver, createCanvasCertificateGenerator } from "../../lib/certificate-pdf";
import type { CertificateGenerator, FileSaver } from "../../lib/certificate-pdf";

import styles from "../ProgressPage.module.css";

type CertificateButtonProps = {
  fullName: string;
  integralScore: number | null;
  cardCount: number;
  /** Подмена в тестах; по умолчанию — canvas → PDF в браузере. */
  generator?: CertificateGenerator;
  saver?: FileSaver;
  clock?: Pick<Clock, "now">;
};

const FILE_NAME_PREFIX = "sertifikat-arm112";

/** «Скачать сертификат (PDF)» — файл-заглушка генерируется на клиенте без сети (этап 2 / опционально). */
export function CertificateButton({
  fullName,
  integralScore,
  cardCount,
  generator,
  saver,
  clock = systemClock,
}: CertificateButtonProps) {
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle");
  const isEmpty = cardCount === 0;

  async function handleDownload() {
    setStatus("busy");
    const issuedAt = new Date(clock.now()).toISOString();
    try {
      const file = await (generator ?? createCanvasCertificateGenerator()).generate({
        fullName,
        integralScore,
        cardCount,
        issuedOn: formatDate(issuedAt),
      });
      (saver ?? createBrowserFileSaver()).save(file, `${FILE_NAME_PREFIX}-${issuedAt.slice(0, 10)}.pdf`);
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className={styles.certificate}>
      <Button
        onClick={handleDownload}
        disabled={isEmpty || status === "busy"}
        title={
          isEmpty
            ? "Сертификат доступен после первой оценённой попытки"
            : "PDF-сертификат (заглушка): ФИО, интегральный балл, дата"
        }
      >
        Скачать сертификат (PDF)
      </Button>
      <span className={styles.certificate__note}>этап 2 / опционально</span>
      {status === "failed" ? (
        <span className={styles.certificate__error} role="alert">
          Не удалось сформировать PDF
        </span>
      ) : null}
    </div>
  );
}
