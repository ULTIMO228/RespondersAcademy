import { ReferenceScreen } from "./ReferenceScreen";

type ReferencePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** `/reference` — справочник для всех ролей; `?q=` — поиск, `?article=` — открытая статья. */
export async function ReferencePage({ searchParams }: ReferencePageProps) {
  const params = await searchParams;
  return <ReferenceScreen initialQuery={first(params.q) ?? ""} initialArticleId={first(params.article)} />;
}
