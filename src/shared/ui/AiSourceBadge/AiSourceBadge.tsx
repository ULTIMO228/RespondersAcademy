import type { AiServedBy } from "@/shared/api";

import styles from "./AiSourceBadge.module.css";

type AiSourceBadgeProps = {
  /** Чем получен текст; без значения (старые данные) читается как шаблон. */
  source?: AiServedBy | null;
  /** Модель — в подсказку, если известна. */
  model?: string | null;
};

const LABELS: Record<AiServedBy, string> = {
  cloud: "ИИ · облако",
  local: "ИИ · локально",
  template: "шаблон",
};

const HINTS: Record<AiServedBy, string> = {
  cloud: "Текст получен от облачной модели через Polza.ai",
  local: "Текст получен от локальной модели",
  template: "Текст собран по шаблону, модель не использовалась",
};

/** Пометка источника текста ИИ в платформе: облако, локальная модель или шаблон (спека 006, FR-011). */
export function AiSourceBadge({ source, model }: AiSourceBadgeProps) {
  const kind: AiServedBy = source ?? "template";
  const title = model ? `${HINTS[kind]} (${model})` : HINTS[kind];
  return (
    <span className={[styles.badge, styles[`badge--${kind}`]].join(" ")} title={title}>
      {LABELS[kind]}
    </span>
  );
}
