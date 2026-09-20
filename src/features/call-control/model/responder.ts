/*
 * ИИ-абонент точки C через мок-слой (POST /api/mock/calls/reply). Реплики — из мока, ответ несёт маркер ИИ.
 * ИИ-модуль: заменить на реальный сервис — достаточно другой реализации CallResponder.
 */
import { postCallReply } from "@/shared/api";

import type { CallResponder } from "./types";

export const apiCallResponder: CallResponder = {
  answer: async (number) => (await postCallReply({ toNumber: number, turn: "answer" })).data,
  reply: async (number, text) => (await postCallReply({ toNumber: number, turn: "reply", text })).data,
};
