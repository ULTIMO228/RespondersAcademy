"use client";

import { useState } from "react";

import { ROUTES } from "@/shared/config";
import { ArmIcon } from "@/shared/ui";

import { applyPhoneInput } from "../lib/phoneMask";
import type { AmendControl, IncidentCardData } from "../model/types";
import { useRecordings } from "../model/useRecordings";
import { CardIcon } from "./CardIcon";
import { LineStatusBlock } from "./LineStatusBlock";
import { PhoneField } from "./PhoneField";
import { RecordingsModal } from "./RecordingsModal";
import { SmsPanel } from "./SmsPanel";

import styles from "./PhoneBar.module.css";

type PhoneBarProps = {
  card: IncidentCardData;
  readOnly?: boolean;
  /** Живой режим обучающегося: статус линии из стора, записи и SMS — из мок-слоя. */
  isLive?: boolean;
  /** Режим дополнения: «телефон на место» редактируется, только если не был заполнен ранее. */
  amend?: AmendControl;
  isLocked?: boolean;
};

type PhoneOverlay = "recordings" | "sms" | null;

function copyToClipboard(value: string) {
  void navigator.clipboard?.writeText(value);
}

/** Верхняя полоса телефонии карточки ДДС (spec п. 1; ДДС_image6, p23_Image108). */
export function PhoneBar({ card, readOnly = false, isLive = false, amend, isLocked = false }: PhoneBarProps) {
  const [localOnSite, setLocalOnSite] = useState(card.phones.onSite);
  const [overlay, setOverlay] = useState<PhoneOverlay>(null);
  const closeOverlay = () => setOverlay(null);
  const openSms = () => setOverlay("sms");
  const live = isLive && !readOnly;
  const callHref = live ? ROUTES.armPhoneForCard(card.id) : ROUTES.armPhone;
  const onSiteDigits = amend ? card.phones.onSite || amend.onSiteDigits : localOnSite;
  const canEditOnSite = amend
    ? amend.isActive && !amend.isBlocked && !isLocked && !card.phones.onSite
    : !readOnly;
  const handleOnSiteChange = (next: string) => {
    if (amend) amend.onOnSiteChange(applyPhoneInput(onSiteDigits, next));
    else setLocalOnSite((previous) => applyPhoneInput(previous, next));
  };

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.bar__handset}
        aria-label="Отключение"
        title="Отключение"
        disabled={readOnly}
      >
        <CardIcon name="hangup" size={26} />
      </button>
      <LineStatusBlock
        hasRecordings={Boolean(card.phones.aon)}
        onRecordingsClick={() => setOverlay("recordings")}
        onSmsClick={openSms}
        isLive={live}
        readOnly={readOnly}
      />
      <PhoneField
        label="АОН"
        value={card.phones.aon}
        onSmsClick={card.phones.aon ? openSms : undefined}
        disabled={readOnly}
        callHref={callHref}
        actions={
          card.phones.aon ? (
            <button
              type="button"
              className={styles.bar__copy}
              onClick={() => copyToClipboard(card.phones.aon)}
              aria-label="Копировать АОН"
              title="Копировать АОН"
            >
              <ArmIcon name="clipboard" size={14} />
            </button>
          ) : null
        }
      />
      <PhoneField
        label="предоставленный"
        value={card.phones.provided}
        disabled={readOnly}
        callHref={callHref}
        actions={<AonTag />}
      />
      <PhoneField
        label="телефон на место"
        value={onSiteDigits}
        onChange={canEditOnSite ? handleOnSiteChange : undefined}
        disabled={readOnly}
        callHref={callHref}
        actions={<AonTag />}
      />
      {overlay === "recordings" ? (
        <RecordingsOverlay card={card} isLive={live} onClose={closeOverlay} />
      ) : null}
      {overlay === "sms" ? (
        <SmsPanel
          cardId={card.id}
          aon={card.phones.aon}
          incoming={card.smsList ?? []}
          receivedAt={card.createdAt}
          isLive={live}
          readOnly={readOnly || isLocked}
          onClose={closeOverlay}
        />
      ) : null}
    </div>
  );
}

function RecordingsOverlay({
  card,
  isLive,
  onClose,
}: {
  card: IncidentCardData;
  isLive: boolean;
  onClose: () => void;
}) {
  const { recordings, error } = useRecordings(card, isLive);
  return <RecordingsModal recordings={recordings} error={error} onClose={onClose} />;
}

/** Метка «АОН» в полях «предоставленный» / «телефон на место» (p23_Image108). */
function AonTag() {
  return <span className={styles.bar__aon}>АОН</span>;
}
