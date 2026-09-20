import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatDurationPadded,
  formatHeaderDate,
  formatHourMinute,
  formatShortDate,
  formatTime,
} from "./dateTime";

describe("dateTime", () => {
  const iso = "2026-09-17T11:13:19+03:00";

  it("форматирует дату и время в 24-часовом русском формате", () => {
    expect(formatDateTime(iso)).toBe("17.09.2026 11:13:19");
    expect(formatShortDate(iso)).toBe("17.09.26");
  });

  it("форматирует дату шапки как в АРМ-112", () => {
    expect(formatHeaderDate(iso)).toBe("Четверг, 17 Сентябрь 2026");
  });

  it("форматирует длительность", () => {
    expect(formatDuration(30_000)).toBe("0:30");
    expect(formatDuration(180_000)).toBe("3:00");
    expect(formatDurationPadded(30_000)).toBe("00:30");
  });

  it("полночь показывает как 00:00, а не 12:00 AM", () => {
    const midnight = "2026-09-17T00:00:00+03:00";
    expect(formatDateTime(midnight)).toBe("17.09.2026 00:00:00");
    expect(formatTime(midnight)).toBe("00:00:00");
    expect(formatHourMinute(midnight)).toBe("00:00");
    expect(formatHeaderDate(midnight)).toBe("Четверг, 17 Сентябрь 2026");
  });

  it("вечернее время — 24-часовое, без AM/PM", () => {
    const evening = "2026-09-17T23:05:07+03:00";
    expect(formatHourMinute(evening)).toBe("23:05");
    expect(formatTime(evening)).toBe("23:05:07");
    expect(formatDateTime(evening)).not.toMatch(/[AP]M|ДП|ПП/i);
  });

  it("переход через полночь считает по московскому поясу", () => {
    // 21:30 UTC 16 сентября = 00:30 московских уже 17 сентября.
    const afterMidnight = "2026-09-16T21:30:00Z";
    expect(formatDate(afterMidnight)).toBe("17.09.2026");
    expect(formatHourMinute(afterMidnight)).toBe("00:30");
  });

  it("переход через месяц и год", () => {
    expect(formatDateTime("2026-08-31T23:59:59+03:00")).toBe("31.08.2026 23:59:59");
    // 21:00 UTC 31 августа = 00:00 московских 1 сентября.
    expect(formatHeaderDate("2026-08-31T21:00:00Z")).toBe("Вторник, 1 Сентябрь 2026");
    expect(formatShortDate("2026-08-31T21:00:00Z")).toBe("01.09.26");
    expect(formatHeaderDate("2026-12-31T21:00:00Z")).toBe("Пятница, 1 Январь 2027");
  });
});
