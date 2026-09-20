"use client";

import { useCallback, useState } from "react";
import type { MouseEvent } from "react";

import { getLastStatusEvent, ServiceTile } from "@/entities/service";
import { getStatusOptions, StatusForm } from "@/features/status-form";
import type { StatusFormValues } from "@/features/status-form";

import { MOCK_CHAT_UNREAD_COUNT, SERVICE_ROW_CAPACITY, TRAINEE_ACTOR } from "../config/constants";
import { buildServiceTiles } from "../model/serviceTiles";
import type { ServiceTileModel } from "../model/serviceTiles";
import type { ServicePanelProps } from "../model/types";
import { useServiceHistory } from "../model/useServiceHistory";
import { useStatusFormState } from "../model/useStatusFormState";
import { MyServiceActions } from "./MyServiceActions";
import { PanelControls } from "./PanelControls";
import { ServiceHistoryPopup } from "./ServiceHistoryPopup";

import styles from "./ServicePanel.module.css";

function isFromButton(event: MouseEvent<HTMLElement>): boolean {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

/**
 * Нижняя тёмная панель «Службы:» (spec п. 6–8; ДДС_image6–20, p23_Image108): плитки списка оповещения,
 * шеврон второго ряда, чат, закрытие карточки; у «моей службы» — история (синий попап) и смена статуса.
 */
export function ServicePanel(props: ServicePanelProps) {
  const { card, services, serviceStatuses, ddsStatuses, myServiceId, readOnly = false } = props;
  const { mainServiceIds = [], chatUnreadCount = MOCK_CHAT_UNREAD_COUNT, isStatusLocked = false } = props;
  const { history, addStatusEvent } = useServiceHistory(card, props.history);
  const [isExpanded, setExpanded] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isSelected, setSelected] = useState(false);
  const [isStatusOpen, setStatusOpen] = useStatusFormState(
    props.isStatusFormOpen,
    props.onStatusFormOpenChange,
  );
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const closeStatus = useCallback(() => setStatusOpen(false), [setStatusOpen]);

  const order = card.notificationList.map((entry) => entry.serviceId);
  const tiles = buildServiceTiles({ services, serviceStatuses, history, order, mainServiceIds });
  const myEvents = myServiceId ? (history[myServiceId] ?? []) : [];
  const currentStatus =
    props.currentDdsStatus !== undefined
      ? props.currentDdsStatus
      : (getLastStatusEvent(myEvents)?.status ?? null);
  const statusOptions = getStatusOptions({ ddsStatuses, currentStatus });
  const canEditStatus = !readOnly && !isStatusLocked;

  async function handleStatusSubmit(values: StatusFormValues) {
    if (!myServiceId) return;
    if (props.onStatusSubmit) {
      await props.onStatusSubmit(values);
    } else {
      const { status, comment, dutyNumber } = values;
      addStatusEvent(myServiceId, {
        status,
        comment,
        dutyNumber,
        at: new Date().toISOString(),
        actor: TRAINEE_ACTOR,
      });
    }
    setStatusOpen(false);
  }

  function renderTile(tile: ServiceTileModel) {
    const isMine = tile.serviceId === myServiceId;
    return (
      <div
        key={tile.serviceId}
        className={styles.panel__slot}
        onClick={isMine ? (event) => !isFromButton(event) && setSelected((selected) => !selected) : undefined}
      >
        {isMine && isHistoryOpen ? (
          <div className={styles.panel__popup}>
            <ServiceHistoryPopup
              title={tile.fullName}
              events={tile.events}
              serviceStatuses={serviceStatuses}
              onClose={closeHistory}
            />
          </div>
        ) : null}
        <ServiceTile
          name={tile.name}
          fullName={tile.fullName}
          statusLine={tile.statusLine}
          isPhoneOnly={tile.isPhoneOnly}
          isMain={tile.isMain}
          isActive={isMine && (isSelected || isHistoryOpen || isStatusOpen)}
          actions={
            isMine ? (
              <MyServiceActions
                isHistoryOpen={isHistoryOpen}
                onHistoryToggle={() => setHistoryOpen((isOpen) => !isOpen)}
                onStatusEdit={canEditStatus ? () => setStatusOpen(true) : undefined}
              />
            ) : undefined
          }
        />
      </div>
    );
  }

  const extraTiles = tiles.slice(SERVICE_ROW_CAPACITY);
  return (
    <footer className={styles.panel} aria-label="Службы" data-readonly={readOnly}>
      <span className={styles.panel__label}>Службы:</span>
      <div className={styles.panel__tiles}>
        {tiles.length === 0 ? (
          <span className={styles.panel__none}>Служб в списке оповещения нет</span>
        ) : null}
        {tiles.slice(0, SERVICE_ROW_CAPACITY).map(renderTile)}
        {isExpanded ? (
          <div className={styles.panel__extra} aria-label="Дополнительные службы">
            {extraTiles.length ? (
              extraTiles.map(renderTile)
            ) : (
              <span className={styles.panel__none}>Дополнительных служб нет</span>
            )}
          </div>
        ) : null}
      </div>
      <PanelControls
        isExpanded={isExpanded}
        onExpandToggle={() => setExpanded((expanded) => !expanded)}
        chatUnreadCount={chatUnreadCount}
        readOnly={readOnly}
      />
      {isStatusOpen && canEditStatus ? (
        <>
          <div className={styles.panel__overlay} onClick={closeStatus} data-testid="status-overlay" />
          <div className={styles.panel__form}>
            <StatusForm options={statusOptions} onSubmit={handleStatusSubmit} onCancel={closeStatus} />
          </div>
        </>
      ) : null}
    </footer>
  );
}
