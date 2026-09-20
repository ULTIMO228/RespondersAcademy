import sessionsJson from "@mocks/sessions.json";
import { describe, expect, it } from "vitest";

import type { SessionContract } from "@/shared/api";

import { projectSessionForStudent } from "./projection";

const sessions = sessionsJson.sessions as SessionContract[];

describe.each(sessions.map((session) => [session.id, session] as const))(
  "projectSessionForStudent: %s",
  (_id, session) => {
    it("проекция курсанта содержит только его выдачи и попытки", () => {
      for (const studentId of session.studentIds) {
        const projection = projectSessionForStudent(session, studentId);
        expect(projection.cardEvents.every((attempt) => attempt.studentId === studentId)).toBe(true);
        expect(projection.cardFlow.every((item) => item.studentId === studentId)).toBe(true);
      }
    });

    it("объединение проекций всех studentIds = полный список событий занятия", () => {
      const projections = session.studentIds.map((studentId) => projectSessionForStudent(session, studentId));
      const attemptIds = projections.flatMap((projection) =>
        projection.cardEvents.map((attempt) => attempt.id),
      );
      expect(attemptIds.sort()).toEqual(session.cardEvents.map((attempt) => attempt.id).sort());
      expect(projections.reduce((sum, projection) => sum + projection.cardFlow.length, 0)).toBe(
        session.cardFlow.length,
      );
    });

    it("каждой попытке проекции соответствует строка cardFlow того же курсанта и карточки", () => {
      for (const studentId of session.studentIds) {
        const { cardFlow, cardEvents } = projectSessionForStudent(session, studentId);
        for (const attempt of cardEvents) {
          expect(cardFlow.some((item) => item.cardId === attempt.cardId)).toBe(true);
        }
      }
    });

    it("курсант вне занятия → пустая проекция", () => {
      expect(projectSessionForStudent(session, "u-999")).toEqual({ cardFlow: [], cardEvents: [] });
    });
  },
);
