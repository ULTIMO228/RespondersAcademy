import Link from "next/link";
import { useEffect, useRef } from "react";

import type { IncidentListItem } from "@/entities/incident";
import { formatDateTime } from "@/shared/lib";
import { Modal, StatusChip } from "@/shared/ui";

import styles from "./CardPreviewModal.module.css";

type CardPreviewModalProps = {
  item: IncidentListItem;
  onClose: () => void;
  /** «Открыть карточку»: фиксация открытия (таймер 30 сек). */
  onOpen?: (incidentId: string) => void;
};

const MODAL_WIDTH = 640;

function SummaryList({ item }: { item: IncidentListItem }) {
  const rows: Array<[string, string]> = [
    ["Дата и время", formatDateTime(item.createdAt)],
    ["Тип происшествия", item.typeName],
    ["Адрес", item.address],
    ["Заявитель", item.preview.applicant || "—"],
    ["АОН", item.preview.phone || "—"],
    ["Статус карточки", item.preview.cardStatus],
    ["Описание", item.description ? `${item.description.meta} ${item.description.text}` : "—"],
  ];
  return (
    <dl className={styles.preview__summary}>
      {rows.map(([term, details]) => (
        <div key={term} className={styles.preview__pair}>
          <dt>{term}</dt>
          <dd>{details}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Предпросмотр карточки из ленты (памятка стр. 14): краткая информация, оповещённые службы, последние статусы. */
export function CardPreviewModal({ item, onClose, onOpen }: CardPreviewModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  /* Фокус — в окно при открытии и обратно на кнопку предпросмотра после закрытия (Esc/✕). */
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    contentRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  return (
    <Modal title={`Происшествие ${item.number}`} onClose={onClose} width={MODAL_WIDTH}>
      <div className={styles.preview} ref={contentRef} tabIndex={-1}>
        <SummaryList item={item} />
        <section aria-labelledby="preview-services">
          <h3 id="preview-services" className={styles.preview__heading}>
            Оповещённые службы
          </h3>
          {item.preview.services.length === 0 ? (
            <p className={styles.preview__empty}>Службы не оповещены</p>
          ) : null}
          <ul className={styles.preview__services}>
            {item.preview.services.map((service) => (
              <li key={service.name} className={styles.preview__service}>
                <span>{service.name}</span>
                <StatusChip
                  label={service.status.title}
                  tone={service.status.tone}
                  marker={service.status.code === "added" ? "added" : "dot"}
                />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="preview-statuses">
          <h3 id="preview-statuses" className={styles.preview__heading}>
            Последние статусы
          </h3>
          {item.preview.recentStatuses.length === 0 ? (
            <p className={styles.preview__empty}>Статусов служб пока нет</p>
          ) : (
            <ul className={styles.preview__history}>
              {item.preview.recentStatuses.map((status) => (
                <li key={`${status.serviceName}-${status.at}-${status.statusTitle}`}>
                  {status.actor} › {status.at} <strong>{status.statusTitle}</strong> · {status.serviceName}
                  {status.comment ? ` › ${status.comment}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
        <Link href={item.href} className={styles.preview__open} onClick={() => onOpen?.(item.id)}>
          Открыть карточку
        </Link>
      </div>
    </Modal>
  );
}
