"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { telephonyStore, useTelephonyStatus } from "@/entities/service";
import type { TelephonyStore } from "@/entities/service";
import {
  ActiveCall,
  checkDialNumber,
  DIAL_MESSAGES,
  DialPad,
  InternalNumbers,
  LINE_DOWN_STATUSES,
  LineStatusIndicator,
  recordFinishedCall,
} from "@/features/call-control";
import type { CallLogEntry, CallResponder, CallTarget, FinishedCall } from "@/features/call-control";
import type { InternalNumber } from "@/shared/api";
import type { Clock } from "@/shared/lib";
import { Panel, Tabs } from "@/shared/ui";

import { DEFAULT_PHONE_TAB, PHONE_TABS } from "../config/phoneTabs";
import { PhoneTabStub } from "./PhoneTabStub";

import styles from "./PhonePage.module.css";

type PhoneConsoleProps = {
  numbers: InternalNumber[];
  expected: { numbers: string[]; context: string } | null;
  /** Карточка, из которой открыт софтфон: вызов пишется в CardEvent.calls её попытки. */
  cardId: string | null;
  studentId: string | null;
  journal: CallLogEntry[];
  onRecorded: (entry: CallLogEntry) => void;
  responder: CallResponder;
  clock?: Clock;
  store?: TelephonyStore;
  /** Журнал вызовов под экраном активного вызова. */
  children?: ReactNode;
};

type ActiveCallSlot = { id: number; target: CallTarget; isFinished: boolean };

/** Софтфон: статус линии, вкладки Контакты/Звонки/SMS/Набор и экран активного вызова. */
export function PhoneConsole({
  numbers,
  expected,
  cardId,
  studentId,
  journal,
  onRecorded,
  responder,
  clock,
  store = telephonyStore,
  children,
}: PhoneConsoleProps) {
  const lineStatus = useTelephonyStatus(store);
  const [activeTab, setActiveTab] = useState(DEFAULT_PHONE_TAB);
  const [dialNumber, setDialNumber] = useState("");
  const [notice, setNotice] = useState<string>();
  const [recordWarning, setRecordWarning] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallSlot | null>(null);

  function getBlockReason(number: string): string | null {
    if (LINE_DOWN_STATUSES.includes(lineStatus)) return DIAL_MESSAGES.lineDown;
    if (activeCall && !activeCall.isFinished) return DIAL_MESSAGES.callInProgress;
    const check = checkDialNumber(number, numbers);
    return check.ok ? null : check.message;
  }

  function handleCall(number: string) {
    const reason = getBlockReason(number);
    setNotice(reason ?? undefined);
    const entry = numbers.find((candidate) => candidate.number === number);
    if (reason || !entry) return;
    setDialNumber(number);
    setRecordWarning(null);
    setActiveCall((current) => ({
      id: (current?.id ?? 0) + 1,
      target: { number, subscriberTitle: entry.title },
      isFinished: false,
    }));
  }

  function handleFinish(call: FinishedCall) {
    setActiveCall((current) => current && { ...current, isFinished: true });
    void recordFinishedCall(call, { cardId, studentId }).then((result) => {
      onRecorded(result.entry);
      setRecordWarning(result.warning);
    });
  }

  function handleDialChange(value: string) {
    setDialNumber(value);
    setNotice(undefined);
  }

  return (
    <div className={styles.phone}>
      <aside className={styles.phone__console} aria-label="Телефон">
        <LineStatusIndicator status={lineStatus} onToggle={store.cycleStatus} />
        <Tabs
          items={PHONE_TABS}
          activeId={activeTab}
          onChange={setActiveTab}
          label="Панель управления вызовами"
        />
        <div className={styles.phone__tab} role="tabpanel">
          {notice && activeTab !== "dial" ? (
            <p className={styles.phone__notice} role="status">
              {notice}
            </p>
          ) : null}
          {activeTab === "contacts" ? (
            <InternalNumbers
              numbers={numbers}
              expectedNumbers={expected?.numbers}
              expectedContext={expected?.context}
              onCall={handleCall}
            />
          ) : null}
          {activeTab === "dial" ? (
            <DialPad
              value={dialNumber}
              onValueChange={handleDialChange}
              onCall={() => handleCall(dialNumber)}
              notice={notice}
            />
          ) : null}
          {activeTab === "calls" || activeTab === "sms" ? (
            <PhoneTabStub
              kind={activeTab}
              activeCall={activeCall && !activeCall.isFinished ? activeCall.target : null}
              journal={journal}
            />
          ) : null}
        </div>
      </aside>
      <div className={styles.phone__main}>
        <Panel title="Активный вызов" headerTone="dark">
          {activeCall ? (
            <ActiveCall
              key={activeCall.id}
              target={activeCall.target}
              responder={responder}
              clock={clock}
              onFinish={handleFinish}
            />
          ) : (
            <p className={styles.phone__empty}>Активных вызовов нет</p>
          )}
          {recordWarning ? (
            <p className={styles.phone__notice} role="status">
              {recordWarning}
            </p>
          ) : null}
        </Panel>
        {children}
      </div>
    </div>
  );
}
