import type { Metadata } from "next";

import { ErrorMapScreen } from "@/pages/teacher/error-map";

export const metadata: Metadata = {
  title: "Карта ошибок",
};

export default function TeacherErrorMapPage() {
  return <ErrorMapScreen />;
}
