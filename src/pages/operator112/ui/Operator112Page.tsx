import { Operator112Missing } from "./Operator112Problem";
import { Operator112Screen } from "./Operator112Screen";

type Operator112PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const ASSIGNMENT_PARAM = "assignmentId";

/**
 * `/arm/operator112?assignmentId=…` — рабочее место специалиста-112. Без assignmentId (прямая ссылка) вызов выдать нельзя:
 * показывается пояснение «откройте задание из раздела заданий».
 */
export async function Operator112Page({ searchParams }: Operator112PageProps) {
  const params = (await searchParams) ?? {};
  const raw = params[ASSIGNMENT_PARAM];
  const assignmentId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return assignmentId ? <Operator112Screen assignmentId={assignmentId} /> : <Operator112Missing />;
}
