/* Route handler GET /api/mock/reference (тонкий: логика — ../reference.ts). */
import { getReferenceData } from "../reference";
import { jsonOk, withErrorHandling } from "../respond";

export const handleGetReference = withErrorHandling(() => jsonOk(getReferenceData()));
