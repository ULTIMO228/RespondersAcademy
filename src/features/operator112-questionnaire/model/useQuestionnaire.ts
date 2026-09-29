"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getNotificationList, sendAttemptEvent } from "@/shared/api";
import type {
  ClassifierEntry,
  NotificationListResponse,
  OperatorEvent,
  OperatorEventRequest,
} from "@/shared/api";

import { EMPTY_SELECTION, resolveEntry, restoreSelection, selectSign } from "./tree";
import type { Selection, SignLevel } from "./tree";

export type QuestionnaireApi = {
  sendEvent: (attemptId: string, event: OperatorEventRequest) => Promise<OperatorEvent>;
  getList: (attemptId: string) => Promise<NotificationListResponse>;
};

const defaultApi: QuestionnaireApi = {
  sendEvent: sendAttemptEvent,
  getList: (id) => getNotificationList(id),
};

export type QuestionnaireValue = {
  group: string;
  signs: string[];
  finalType: string;
  classifierCode: string;
};

export type ListState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; list: NotificationListResponse };

type Options = {
  attemptId: string;
  entries: readonly ClassifierEntry[];
  /** Признаки последнего signSelected из попытки (восстановление после перезагрузки). */
  initialSigns?: readonly string[];
  disabled?: boolean;
  /** Смена значения пересчитывает список оповещения: например, после флага «Пострадавшие» на карточке. */
  refreshToken?: number;
  api?: QuestionnaireApi;
  onChange?: (value: QuestionnaireValue, list: NotificationListResponse | null) => void;
};

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Состояние опросной карты: выбор признаков → событие signSelected → пересчёт notification-list на сервере.
 * Устаревшие ответы отбрасываются (порядковый номер запроса): быстрые клики не показывают чужой список.
 */
export function useQuestionnaire({
  attemptId,
  entries,
  initialSigns,
  disabled = false,
  refreshToken = 0,
  api = defaultApi,
  onChange,
}: Options) {
  const [initial] = useState<Selection>(() => restoreSelection(entries, initialSigns ?? []));
  const [selection, setSelection] = useState<Selection>(initial);
  const [listState, setListState] = useState<ListState>({ status: "empty" });
  const [notice, setNotice] = useState<string | null>(null);
  const requestNo = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refreshList = useCallback(
    async (next: Selection) => {
      const current = ++requestNo.current;
      setListState({ status: "loading" });
      try {
        const list = await api.getList(attemptId);
        if (current !== requestNo.current) return;
        setListState({ status: "ready", list });
        const entry = resolveEntry(entries, next);
        onChangeRef.current?.(
          {
            group: next.group,
            signs: next.signs,
            finalType: list.finalType || entry?.finalType || "",
            classifierCode: list.classifierCode || entry?.code || "",
          },
          list,
        );
      } catch (error) {
        if (current !== requestNo.current) return;
        setListState({ status: "error", message: toMessage(error, "Не удалось получить список оповещения") });
      }
    },
    [api, attemptId, entries],
  );

  const commit = useCallback(
    async (next: Selection) => {
      setSelection(next);
      setNotice(null);
      const entry = resolveEntry(entries, next);
      onChangeRef.current?.(
        {
          group: next.group,
          signs: next.signs,
          finalType: entry?.finalType ?? "",
          classifierCode: entry?.code ?? "",
        },
        null,
      );
      if (next.signs.length === 0) {
        requestNo.current += 1;
        setListState({ status: "empty" });
      }
      try {
        await api.sendEvent(attemptId, { type: "signSelected", payload: { signs: next.signs } });
      } catch (error) {
        setNotice(toMessage(error, "Не удалось сохранить выбор признака"));
        return;
      }
      if (next.signs.length > 0) await refreshList(next);
    },
    [api, attemptId, entries, refreshList],
  );

  const chooseGroup = (group: string) => {
    if (disabled) return;
    void commit(group ? { group, signs: [] } : EMPTY_SELECTION);
  };
  const chooseSign = (level: SignLevel, value: string) => {
    if (disabled) return;
    void commit(selectSign(selection, level, value));
  };

  /** Ручное добавление условной службы: событие serviceAdded, затем пересчёт (сервер помечает её addedBy: manual). */
  const addService = async (serviceId: string) => {
    if (disabled) return;
    setNotice(null);
    try {
      await api.sendEvent(attemptId, { type: "serviceAdded", payload: { serviceId } });
    } catch (error) {
      setNotice(toMessage(error, "Не удалось добавить службу"));
      return;
    }
    await refreshList(selection);
  };

  // Выбор, восстановленный после перезагрузки: список оповещения запрашивается один раз при монтировании.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || initial.signs.length === 0) return;
    restored.current = true;
    void refreshList(initial);
  }, [initial, refreshList]);

  const lastToken = useRef(refreshToken);
  useEffect(() => {
    if (lastToken.current === refreshToken) return;
    lastToken.current = refreshToken;
    if (selection.signs.length > 0) void refreshList(selection);
  }, [refreshToken, refreshList, selection]);

  return {
    selection,
    listState,
    notice,
    chooseGroup,
    chooseSign,
    addService,
    retry: () => refreshList(selection),
  };
}
