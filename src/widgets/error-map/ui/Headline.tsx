import type { ErrorMapHeadline, HeadlineKind } from "@/shared/api";

import styles from "./ErrorMap.module.css";

const KIND_ICON: Record<HeadlineKind, string> = { problems: "!", clean: "✓", noData: "○" };

export interface HeadlineProps {
  headline: ErrorMapHeadline;
}

/** Крупная фраза-вывод. Акцент по виду вывода дублируется значком; смысл несёт сама фраза. */
export function Headline({ headline }: HeadlineProps) {
  return (
    <section className={[styles.headline, styles[`headline--${headline.kind}`]].join(" ")}>
      <span className={styles.headline__icon} aria-hidden="true">
        {KIND_ICON[headline.kind]}
      </span>
      <p className={styles.headline__text}>{headline.text}</p>
    </section>
  );
}
