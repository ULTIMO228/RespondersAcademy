/* Route handlers /api/mock/admin/users/** (тонкие: логика — ../admin-users.ts). */
import {
  createAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
  setAdminUserActive,
  toggleUserActive,
  updateAdminUser,
} from "../admin-users";
import { readSearchParams } from "../request";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";

export const handleGetAdminUsers = withErrorHandling((request: Request) =>
  jsonOk(listAdminUsers(readSearchParams(request))),
);

export const handlePostAdminUser = withErrorHandling(async (request: Request) =>
  jsonCreated(await createAdminUser(request)),
);

export const handlePatchAdminUser = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonOk(await updateAdminUser((await params).id, request)),
);

export const handlePostAdminUserBlock = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await setAdminUserActive((await params).id, false, request)),
);

export const handlePostAdminUserUnblock = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await setAdminUserActive((await params).id, true, request)),
);

export const handlePostAdminUserResetPassword = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await resetAdminUserPassword((await params).id, request)),
);

export const handlePostAdminToggleActive = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await toggleUserActive((await params).id, request)),
);
