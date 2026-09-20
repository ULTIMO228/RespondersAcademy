import { MOCK_LINE_FAULTS, MOCK_LINE_PARAM } from "@/features/call-control";
import type { LineStatus } from "@/features/call-control";

import { PhoneScreen } from "./PhoneScreen";

import styles from "./PhonePage.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

type PhonePageProps = {
  searchParams?: Promise<SearchParams>;
};

const CARD_ID_PARAM = "cardId";

function readParam(params: SearchParams, key: string): string | null {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || null;
}

function readMockLine(params: SearchParams): LineStatus | null {
  const value = readParam(params, MOCK_LINE_PARAM);
  return MOCK_LINE_FAULTS.find((fault) => fault === value) ?? null;
}

/**
 * `/arm/phone` — софтфон учебного контура B→C. `?cardId=` — вызов из карточки (подсказка ожидаемого номера
 * и запись в CardEvent.calls); `?mockLine=disconnected|error` — мок-флаг демонстрации сбоя линии.
 */
export async function PhonePage({ searchParams }: PhonePageProps) {
  const params = (await searchParams) ?? {};
  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Софтфон</h1>
      <PhoneScreen cardId={readParam(params, CARD_ID_PARAM)} mockLine={readMockLine(params)} />
    </div>
  );
}
