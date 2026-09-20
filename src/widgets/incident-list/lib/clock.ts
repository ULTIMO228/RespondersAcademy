import { formatHeaderDate, formatHourMinute, formatTime } from "@/shared/lib";

import type { JournalClock } from "../model/types";
import { toMoscowIso } from "./time";

const SECONDS_OFFSET = -2;

/** Живые дата/время шапки (Intl ru-RU, 24 ч, Москва): «Четверг, 17 Сентябрь 2026» · «11:24» + «:26». */
export function buildJournalClock(nowMs: number): JournalClock {
  const iso = toMoscowIso(nowMs);
  return {
    iso,
    dateLabel: formatHeaderDate(iso),
    hourMinute: formatHourMinute(iso),
    seconds: formatTime(iso).slice(SECONDS_OFFSET),
  };
}
