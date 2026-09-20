import { DEFAULT_REACTION_VALUE, DEFAULT_TIMER_VALUE } from "../config/constants";
import type { IncidentCardViewProps } from "../model/types";
import { AddressBlock } from "./AddressBlock";
import { AmendBlock } from "./AmendBlock";
import { ApplicantRow } from "./ApplicantRow";
import { CardHeader } from "./CardHeader";
import { CardLinks } from "./CardLinks";
import { DispatcherAction } from "./DispatcherAction";
import { EventJournal } from "./EventJournal";
import { PhoneBar } from "./PhoneBar";
import { WhatHappened } from "./WhatHappened";
import { WorkLines } from "./WorkLines";

import styles from "./IncidentCardView.module.css";

/**
 * Карточка происшествия в режиме диспетчера ДДС (spec/04-pages/02-arm-card.md, ДДС_image6, p23_Image108).
 * readOnly — просмотр преподавателем: контролы неактивны/скрыты, без смены статусов, ввода и запросов к API.
 * controls — живой режим обучающегося (данные и действия из pages/incident).
 */
export function IncidentCardView({
  card,
  classifierEntries,
  linkedCards,
  isExceeded = false,
  readOnly = false,
  stateToggleHref,
  timerValue = DEFAULT_TIMER_VALUE,
  reactionValue = DEFAULT_REACTION_VALUE,
  serviceNames = [],
  controls,
}: IncidentCardViewProps) {
  const live = readOnly ? undefined : controls;
  const isLocked = live?.isLocked ?? false;
  const amend = live?.amend;
  const isInputBlocked = isLocked || Boolean(amend?.isBlocked);
  return (
    <article
      className={styles.card}
      data-exceeded={isExceeded}
      data-readonly={readOnly}
      data-locked={isLocked}
      data-mode={amend?.isActive ? "amend" : "view"}
    >
      <div className={styles.card__top}>
        <PhoneBar card={card} readOnly={readOnly} isLive={Boolean(live)} amend={amend} isLocked={isLocked} />
        <CardHeader
          number={card.number}
          createdAt={card.createdAt}
          registeredBy={card.registeredBy}
          isExceeded={isExceeded}
          timerValue={timerValue}
          reactionValue={reactionValue}
          stateToggleHref={readOnly ? undefined : stateToggleHref}
          readOnly={readOnly}
          isReactionExceeded={live?.isReactionExceeded}
          isFromVis={card.createdByVis}
          onViewClick={amend?.onView}
          onAmendClick={amend?.onStart}
          isAmendActive={amend?.isActive}
          isAmendDisabled={isLocked}
        />
      </div>
      <ApplicantRow
        applicant={card.applicant}
        casualties={card.what.casualties}
        emergency={card.emergency}
        isFromVis={card.createdByVis}
        flags={live?.flags}
        isLocked={isInputBlocked}
      />
      <div className={styles.card__body}>
        <div className={styles.card__column}>
          <AddressBlock address={card.address} readOnly={readOnly} showPolygon={live?.showSmsPolygon} />
          <EventJournal
            description={card.description}
            isFromVis={card.createdByVis}
            extraEntries={live?.journalExtra}
          />
          {amend ? <AmendBlock amend={amend} isLocked={isLocked} /> : null}
          <DispatcherAction readOnly={readOnly} control={live?.dispatcher} isDisabled={isInputBlocked} />
        </div>
        <div className={styles.card__column}>
          <WhatHappened
            what={card.what}
            classifierEntries={classifierEntries}
            isFromVis={card.createdByVis}
          />
          <CardLinks linkedCards={linkedCards} readOnly={readOnly} />
        </div>
      </div>
      <WorkLines
        workLines={card.workLines}
        serviceNames={serviceNames}
        readOnly={readOnly}
        control={live?.workLines}
        isLocked={isInputBlocked}
      />
    </article>
  );
}
