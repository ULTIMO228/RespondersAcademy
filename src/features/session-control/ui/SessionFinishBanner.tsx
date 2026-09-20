"use client";

import Link from "next/link";

import type { SessionContract } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import styles from "./SessionControl.module.css";

type SessionFinishBannerProps = {
  session: SessionContract;
  /** Переход к отчёту: занятие помечается как отчётное (finished → reported, POST /[id]/control). */
  onReport?: () => void;
};

export const NO_ATTEMPTS_NOTE = "Нет данных по попыткам — отчёт будет сформирован без результатов курсантов";

/**
 * Завершённое занятие (T3.2-12): предложение «Сформировать отчёт» → /teacher/reports/[sessionId].
 * Занятие без единой завершённой попытки формирует отчёт с пометкой «нет данных по попыткам».
 */
export function SessionFinishBanner({ session, onReport }: SessionFinishBannerProps) {
  const completed = session.cardEvents.filter((attempt) => attempt.completedAt !== "");
  const isReported = session.state === "reported";
  return (
    <section className={styles.control__banner} aria-label="Занятие завершено">
      <span className={styles.control__bannerTitle}>
        {isReported ? "Отчёт по занятию сформирован" : "Занятие завершено"}
      </span>
      {completed.length === 0 ? <span className={styles.control__note}>{NO_ATTEMPTS_NOTE}</span> : null}
      <Link href={ROUTES.teacherReport(session.id)} className={styles.control__report} onClick={onReport}>
        Сформировать отчёт
      </Link>
    </section>
  );
}
