/* Route handlers /api/mock/auth/* (тонкие: логика — ../auth.ts). Cookie сессии ставит и очищает сервер. */
import { changePassword, getAuthPolicy, getSessionProfile, login, logout, logoutAll } from "../auth";
import { HTTP_STATUS, jsonOk, withErrorHandling } from "../respond";

const SET_COOKIE = "set-cookie";

export const handlePostLogin = withErrorHandling(async (request: Request) => {
  const { session, setCookie } = await login(request);
  const response = jsonOk(session);
  response.headers.append(SET_COOKIE, setCookie);
  return response;
});

/** GET /api/mock/auth/policy — политика входа для формы `/login` (T4.2-17). */
export const handleGetAuthPolicy = withErrorHandling(() => jsonOk(getAuthPolicy()));

/** GET /api/mock/auth/session — профиль по cookie сессии (401 без неё). */
export const handleGetAuthSession = withErrorHandling((request: Request) =>
  jsonOk(getSessionProfile(request)),
);

function noContentWithCookie(clearCookie: string): Response {
  return new Response(null, { status: HTTP_STATUS.noContent, headers: { [SET_COOKIE]: clearCookie } });
}

export const handlePostLogout = withErrorHandling((request: Request) =>
  noContentWithCookie(logout(request).clearCookie),
);

export const handlePostLogoutAll = withErrorHandling((request: Request) =>
  noContentWithCookie(logoutAll(request).clearCookie),
);

export const handlePostPassword = withErrorHandling(async (request: Request) => {
  await changePassword(request);
  return new Response(null, { status: HTTP_STATUS.noContent });
});
