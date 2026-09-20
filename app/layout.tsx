import type { Metadata } from "next";

export { RootLayout as default } from "@/app";

export const metadata: Metadata = {
  // Шаблон подставляет название экрана: «Поиск происшествий — Учебный АРМ-112» (T5.2-08).
  title: {
    default: "Учебный АРМ-112 — тренажёр оператора ДДС",
    template: "%s — Учебный АРМ-112",
  },
  description: "Учебная система. Не является рабочей системой-112.",
};
