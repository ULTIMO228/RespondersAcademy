import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildProblemReportForm,
  createProblemReport,
  listTeacherProblemReports,
  markProblemReportRead,
  problemReportAttachmentUrl,
} from "./problem-reports";

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("клиент «Сообщить о проблеме»", () => {
  it("buildProblemReportForm: необязательные поля попадают только если заданы", () => {
    const bare = buildProblemReportForm({ text: "Не открывается карточка" });
    expect(bare.get("text")).toBe("Не открывается карточка");
    expect(bare.has("attemptId")).toBe(false);
    expect(bare.has("incidentNumber")).toBe(false);
    expect(bare.has("attachment")).toBe(false);
    const full = buildProblemReportForm({
      text: "Скриншот",
      attemptId: "att-3",
      incidentNumber: 132919,
      attachment: new File(["\x89PNG"], "shot.png", { type: "image/png" }),
    });
    expect(full.get("attemptId")).toBe("att-3");
    expect(full.get("incidentNumber")).toBe("132919");
    expect((full.get("attachment") as File).name).toBe("shot.png");
  });

  it("createProblemReport: POST multipart без ручного Content-Type; 201 отдаёт ProblemReport", async () => {
    const fetchMock = stubFetch(201, {
      id: "pr-001",
      hasAttachment: false,
      text: "Текст",
      studentName: "Иванов",
    });
    const report = await createProblemReport(buildProblemReportForm({ text: "Текст" }));
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("/api/v1/problem-reports");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    expect(report.id).toBe("pr-001");
  });

  it("createProblemReport: 403 доходит до вызывающего как ApiError с сообщением сервера", async () => {
    stubFetch(403, { error: { code: "forbidden", message: "Недостаточно прав" } });
    await expect(createProblemReport(buildProblemReportForm({ text: "Текст" }))).rejects.toMatchObject({
      status: 403,
      message: "Недостаточно прав",
    });
  });

  it("listTeacherProblemReports: возвращает items; путь — /api/v1/teacher/problem-reports", async () => {
    const fetchMock = stubFetch(200, { items: [{ id: "pr-002" }, { id: "pr-001" }] });
    const items = await listTeacherProblemReports();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/teacher/problem-reports");
    expect(items.map((item) => item.id)).toEqual(["pr-002", "pr-001"]);
  });

  it("markProblemReportRead: POST …/read с закодированным id", async () => {
    const fetchMock = stubFetch(200, { id: "pr-001", readAt: "2026-10-20T10:00:00+03:00" });
    const report = await markProblemReportRead("pr-001");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/teacher/problem-reports/pr-001/read");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(report.readAt).toBe("2026-10-20T10:00:00+03:00");
  });

  it("problemReportAttachmentUrl: same-origin адрес вложения", () => {
    expect(problemReportAttachmentUrl("pr 7")).toBe("/api/v1/teacher/problem-reports/pr%207/attachment");
  });
});
