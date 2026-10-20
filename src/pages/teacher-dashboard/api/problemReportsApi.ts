/* Блок «Сообщения о проблемах» на главной преподавателя — /api/v1/teacher/problem-reports (спека 009, US6). */
import { listTeacherProblemReports, markProblemReportRead, problemReportAttachmentUrl } from "@/shared/api";
import type { ProblemReport } from "@/shared/api";

export type ProblemReportsApi = {
  list: (signal?: AbortSignal) => Promise<ProblemReport[]>;
  markRead: (reportId: string) => Promise<ProblemReport>;
  attachmentUrl: (reportId: string) => string;
};

export const teacherProblemReportsApi: ProblemReportsApi = {
  list: (signal) => listTeacherProblemReports(signal),
  markRead: (reportId) => markProblemReportRead(reportId),
  attachmentUrl: problemReportAttachmentUrl,
};
