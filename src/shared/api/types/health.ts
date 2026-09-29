/* GET /api/v1/health (backend/app/main.py::health): без авторизации, только состояние процесса и БД. */
export interface HealthStatus {
  status: string;
  /** "sqlite" | "postgresql". */
  db: string;
  version: string;
}
