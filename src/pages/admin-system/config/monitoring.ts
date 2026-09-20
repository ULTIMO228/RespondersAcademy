/*
 * Подписи секции «Мониторинг нагрузки». Данные рядов приходят из мок-API
 * (`GET /admin/system/monitoring`, `GET /admin/system/usage-stats`) — здесь только тексты и нормативы
 * ТЗ §7 в формулировках спеки.
 */
import type { UsageStatsPeriodId } from "@/shared/api";

export const CHART_TITLES = {
  cpuMemory: "CPU и память, %",
  network: "Сеть, Мбит/с",
  sessions: "Активные сессии",
  response: "Отклик интерфейса, сек",
  logins: "Входы по ролям",
  activity: "Активность пользователей по времени",
  cards: "Карточки за период",
} as const;

export const SESSIONS_NORM_LABEL = "норматив: ≥ 20 одновременных сессий";
export const RESPONSE_NORM_LABEL = "норматив: отклик ≤ 2 сек";

export const STAT_PERIOD_OPTIONS: { value: UsageStatsPeriodId; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
];

export const DEFAULT_STAT_PERIOD: UsageStatsPeriodId = "week";
