import { APP_ENV } from "@/shared/config";

import { createApiClient } from "./client";

const MOCK_API_SUFFIX = "/api/mock";
const mockApiBaseUrl = APP_ENV.mockApiBaseUrl.replace(/\/+$/, "");
export const aiApiBaseUrl = mockApiBaseUrl.endsWith(MOCK_API_SUFFIX)
  ? `${mockApiBaseUrl.slice(0, -MOCK_API_SUFFIX.length)}/api/v1/ai`
  : "/api/v1/ai";

export const aiApiClient = createApiClient({ baseUrl: aiApiBaseUrl });
