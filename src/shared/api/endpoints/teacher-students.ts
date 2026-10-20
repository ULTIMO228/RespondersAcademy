import { v1ApiClient } from "../v1-client";
import type { PublicUser, Specialization } from "../types";

export function updateStudentSpecializations(
  studentId: string,
  specializations: Specialization[],
): Promise<PublicUser> {
  return v1ApiClient.patch<PublicUser>(`/teacher/students/${encodeURIComponent(studentId)}/specializations`, {
    specializations,
  });
}
