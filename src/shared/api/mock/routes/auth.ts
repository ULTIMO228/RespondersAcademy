/* Route handler POST /api/mock/auth/login (тонкий: логика — ../auth.ts). */
import { getAuthPolicy, login } from "../auth";
import { jsonOk, withErrorHandling } from "../respond";

export const handlePostLogin = withErrorHandling(async (request: Request) => jsonOk(await login(request)));

/** GET /api/mock/auth/policy — политика входа для формы `/login` (T4.2-17). */
export const handleGetAuthPolicy = withErrorHandling(() => jsonOk(getAuthPolicy()));
