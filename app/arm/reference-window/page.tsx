import type { Metadata } from "next";

import { ReferenceWindow } from "@/features/arm-reference";

export const metadata: Metadata = {
  title: "Справочник",
};

type PageProps = { searchParams: Promise<{ q?: string | string[]; article?: string | string[] }> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Окно справочника для второго монитора (спека 005, US3): только поиск и статья, без меню кабинета. */
export default async function ReferenceWindowPage({ searchParams }: PageProps) {
  const { q, article } = await searchParams;
  return <ReferenceWindow initialQuery={first(q) ?? ""} initialArticleId={first(article) ?? null} />;
}
