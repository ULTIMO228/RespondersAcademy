import { afterEach, describe, expect, it, vi } from "vitest";

import { listWorkMessages, postReportAudio } from "./work-messages";

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("клиент сообщений служб и доклада", () => {
  it("listWorkMessages: GET с курсором since; без курсора параметра нет", async () => {
    const fetchMock = stubFetch(200, []);
    await listWorkMessages("att-1", "2026-09-29T10:00:05+03:00");
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/attempts/att-1/work-messages");
    expect(url.searchParams.get("since")).toBe("2026-09-29T10:00:05+03:00");
    const second = stubFetch(200, []);
    await listWorkMessages("att-1");
    expect(String(second.mock.calls[0][0])).not.toContain("since");
  });

  it("postReportAudio: multipart с file и to_number, без ручного Content-Type", async () => {
    const fetchMock = stubFetch(201, {
      attemptId: "att-1",
      call: {},
      recording: { id: "call-1", url: "/x" },
    });
    await postReportAudio("att-1", new Blob(["RIFF"], { type: "audio/wav" }), "112");
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("/api/v1/attempts/att-1/report-audio");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined();
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get("file") as File).name).toBe("report.wav");
    expect(form.get("to_number")).toBe("112");
  });

  it("503 без модели распознавания и 400 «речь не распознана» доходят дословно", async () => {
    stubFetch(503, { error: { code: "internal", message: "Локальная модель Vosk small-ru не найдена" } });
    await expect(postReportAudio("att-1", new Blob(["x"]))).rejects.toMatchObject({ status: 503 });
    stubFetch(400, { error: { code: "validationFailed", message: "Речь в аудиодокладе не распознана" } });
    await expect(postReportAudio("att-1", new Blob(["x"]))).rejects.toMatchObject({
      status: 400,
      message: "Речь в аудиодокладе не распознана",
    });
  });
});
