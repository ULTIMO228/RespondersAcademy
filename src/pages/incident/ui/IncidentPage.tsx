import { getSessionUser } from "@/entities/user/index.server";

import { AMEND_LOCK_PARAM, ISSUED_AT_PARAM } from "../model/constants";
import { IncidentScreen } from "./IncidentScreen";

type SearchParams = Record<string, string | string[] | undefined>;

type IncidentPageProps = {
  params: Promise<{ cardId: string }>;
  searchParams?: Promise<SearchParams>;
};

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function readSeconds(params: SearchParams, key: string): number {
  const value = Number(readParam(params, key) ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Экран «Карточка происшествия» ДДС (/arm/card/[cardId]). Серверный компонент: обучающийся — пользователь
 * сессии (гварды — proxy + лэйаут), данные карточки клиент берёт из мок-слоя /api/mock/*.
 * ?issuedAt= — время выдачи лентой занятия; ?amendLock=N — мок-блокировка дополнения на N секунд.
 */
export async function IncidentPage({ params, searchParams }: IncidentPageProps) {
  const { cardId } = await params;
  const query = (await searchParams) ?? {};
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <IncidentScreen
      cardId={cardId}
      student={sessionUser.user}
      issuedAt={readParam(query, ISSUED_AT_PARAM)}
      amendLockSeconds={readSeconds(query, AMEND_LOCK_PARAM)}
    />
  );
}
