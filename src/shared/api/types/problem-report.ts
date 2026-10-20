/*
 * «Сообщить о проблеме» (спека 009, US6; contracts/api.md, data-model.md → ProblemReport). Ответ API — camelCase.
 * Путь к файлу вложения наружу не отдаётся: признак `hasAttachment`, файл — отдельным запросом преподавателя.
 * `studentName` и `groupId` добавлены к контракту: список преподавателя без них не показывает отправителя.
 */
export type ProblemReport = {
  id: string;
  studentId: string;
  studentName: string;
  groupId?: string;
  attemptId?: string;
  incidentNumber?: number;
  text: string;
  hasAttachment: boolean;
  /** Время сервера, ISO с +03:00. */
  createdAt: string;
  /** Преподаватель отметил прочитанным; нет поля — ещё не прочитано. */
  readAt?: string;
};

/** Ответ `GET /teacher/problem-reports`: новые сверху. */
export type ProblemReportList = { items: ProblemReport[] };
