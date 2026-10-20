/* Банк карточек обучающихся-112 — /api/v1/student-cards (спека 011): подача карточек оператору ДДС. */
import { v1ApiClient } from "../v1-client";
import type { StudentCard } from "../types";

/** GET /student-cards: преподаватель — карточки обучающихся своих групп, администратор — все; обучающемуся 403. */
export function listStudentCards(signal?: AbortSignal): Promise<StudentCard[]> {
  return v1ApiClient.get<StudentCard[]>("/student-cards", undefined, signal);
}
