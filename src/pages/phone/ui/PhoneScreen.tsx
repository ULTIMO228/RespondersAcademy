"use client";

import { useEffect } from "react";

import { telephonyStore } from "@/entities/service";
import type { TelephonyStore } from "@/entities/service";
import { useAuthSession } from "@/entities/user";
import { apiCallResponder } from "@/features/call-control";
import type { CallResponder, LineStatus } from "@/features/call-control";
import type { InternalNumber } from "@/shared/api";
import type { Clock } from "@/shared/lib";

import { defaultPhoneApi } from "../api/phoneApi";
import type { PhoneApi } from "../api/phoneApi";
import { describeExpected, toCallLogRow } from "../lib/cardContext";
import { useCallJournal } from "../model/useCallJournal";
import { usePhoneDirectory } from "../model/usePhoneDirectory";
import { CallLog } from "./CallLog";
import { PhoneConsole } from "./PhoneConsole";

import styles from "./PhonePage.module.css";

type PhoneScreenProps = {
  cardId: string | null;
  mockLine: LineStatus | null;
  /** Зависимости для тестов: мок-API, ИИ-абонент, часы, стор линии. */
  api?: PhoneApi;
  responder?: CallResponder;
  clock?: Clock;
  store?: TelephonyStore;
};

const NO_NUMBERS: InternalNumber[] = [];

/** Клиентская часть софтфона: данные мок-слоя, статус линии из общего стора, журнал вызовов. */
export function PhoneScreen({
  cardId,
  mockLine,
  api = defaultPhoneApi,
  responder = apiCallResponder,
  clock,
  store = telephonyStore,
}: PhoneScreenProps) {
  const studentId = useAuthSession()?.userId ?? null;
  const directory = usePhoneDirectory(cardId, api);
  const numbers = directory.status === "ready" ? directory.data.numbers : NO_NUMBERS;
  const expected = directory.status === "ready" ? directory.data.expected : null;
  const journal = useCallJournal(studentId, numbers, api);

  useEffect(() => {
    if (mockLine) store.setStatus(mockLine);
  }, [mockLine, store]);

  if (directory.status !== "ready") {
    const text = directory.status === "loading" ? "Загрузка справочника номеров…" : directory.message;
    return (
      <p className={styles.phone__empty} role={directory.status === "error" ? "alert" : "status"}>
        {text}
      </p>
    );
  }

  return (
    <PhoneConsole
      numbers={numbers}
      expected={expected ? { numbers: expected.numbers, context: describeExpected(expected) } : null}
      cardId={expected?.cardId ?? cardId}
      studentId={studentId}
      journal={journal.entries}
      onRecorded={journal.add}
      responder={responder}
      clock={clock}
      store={store}
    >
      <CallLog
        rows={journal.entries.map(toCallLogRow)}
        error={journal.state.status === "error" ? journal.state.message : null}
        isLoading={journal.state.status === "loading"}
      />
    </PhoneConsole>
  );
}
