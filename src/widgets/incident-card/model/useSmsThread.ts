"use client";

import { useEffect, useState } from "react";

import { getCardSms, postCardSms } from "@/shared/api";
import type { CardSms } from "@/shared/api";

export type SmsMessage = { id: string; direction: "in" | "out"; text: string; at: string };

type UseSmsThreadOptions = {
  cardId: string;
  /** Живой режим: переписка из GET/POST /api/mock/cards/[id]/sms, иначе — локально (прототип). */
  isLive: boolean;
  incoming: string[];
  receivedAt: string;
};

function fromIncoming(incoming: string[], receivedAt: string): SmsMessage[] {
  return incoming.map((text, index) => ({ id: `in-${index}`, direction: "in", text, at: receivedAt }));
}

function fromApi(sms: CardSms): SmsMessage {
  return { id: sms.id, direction: sms.direction === "incoming" ? "in" : "out", text: sms.text, at: sms.at };
}

/** Переписка по АОН карточки (п. 14): все СМС с одного АОН — в первую карточку (правило мок-слоя). */
export function useSmsThread({ cardId, isLive, incoming, receivedAt }: UseSmsThreadOptions) {
  const [messages, setMessages] = useState<SmsMessage[]>(() =>
    isLive ? [] : fromIncoming(incoming, receivedAt),
  );
  const [isLoading, setLoading] = useState(isLive);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive) return undefined;
    const controller = new AbortController();
    getCardSms(cardId, controller.signal)
      .then((list) => setMessages(list.map(fromApi)))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cardId, isLive]);

  async function send(text: string) {
    if (!isLive) {
      const at = new Date().toISOString();
      setMessages((previous) => [...previous, { id: `out-${previous.length}`, direction: "out", text, at }]);
      return;
    }
    setError(null);
    try {
      const sent = await postCardSms(cardId, { text });
      setMessages((previous) => [...previous, fromApi(sent)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  }

  return { messages, isLoading, error, send };
}
