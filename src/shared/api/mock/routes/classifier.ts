/* Route handler GET /api/mock/classifier?group= (тонкий: логика — ../classifier.ts). */
import { classifierVersionHeader, listClassifierEntries } from "../classifier";
import { readSearchParams } from "../request";
import { withErrorHandling } from "../respond";

export const handleGetClassifier = withErrorHandling((request: Request) =>
  Response.json(listClassifierEntries(readSearchParams(request)), { headers: classifierVersionHeader() }),
);
