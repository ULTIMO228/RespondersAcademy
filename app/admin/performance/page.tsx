import type { Metadata } from "next";

import { PerformanceScreen } from "@/pages/teacher/performance";

export const metadata: Metadata = {
  title: "Успеваемость",
};

export default function AdminPerformancePage() {
  return <PerformanceScreen />;
}
