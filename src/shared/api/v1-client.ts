/*
 * Клиент /api/v1 (спека 002): режим 112, задания, лобби, справочник. Работает только с бэкендом — без BACKEND_URL
 * Next отвечает 404 без тела { error }, клиент превращает его в ServerRequiredError (requiresServer).
 * Базовый адрес выводится из NEXT_PUBLIC_MOCK_API_BASE_URL так же, как у ИИ-клиента (ai-client.ts).
 */
import { APP_ENV } from "@/shared/config";

import { createApiClient } from "./client";

const MOCK_API_SUFFIX = "/api/mock";
const mockApiBaseUrl = APP_ENV.mockApiBaseUrl.replace(/\/+$/, "");
export const v1ApiBaseUrl = mockApiBaseUrl.endsWith(MOCK_API_SUFFIX)
  ? `${mockApiBaseUrl.slice(0, -MOCK_API_SUFFIX.length)}/api/v1`
  : "/api/v1";

export const v1ApiClient = createApiClient({ baseUrl: v1ApiBaseUrl, requiresServer: true });
