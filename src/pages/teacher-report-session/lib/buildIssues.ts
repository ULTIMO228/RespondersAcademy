/*
 * Ошибки попытки построчно (spec/000-фронт/04-pages/13 п. 3): замечания оценки (mistakes) и грамматика —
 * поле карточки, фрагмент «как написано → как правильно», тип (орфография/синтаксис), критичность.
 */
import { GRAMMAR_ERROR_SEVERITY } from "@/entities/report";
import type { MistakeSeverity } from "@/entities/report";
import { ENTERED_FIELD_TITLES } from "@/entities/session";
import type { Evaluation, GrammarErrorType } from "@/shared/api";

import type { IssueView } from "../model/types";

export const GRAMMAR_TYPE_TITLES: Record<GrammarErrorType, string> = {
  spelling: "орфография",
  syntax: "синтаксис",
};

export function buildIssues(evaluation: Evaluation): IssueView[] {
  const mistakes: IssueView[] = evaluation.errors.map((error, index) => ({
    id: `mistake-${index}`,
    severity: error.severity as MistakeSeverity,
    kind: "mistake",
    message: error.message,
  }));
  const grammar: IssueView[] = evaluation.grammarErrors.map((error, index) => ({
    id: `grammar-${index}`,
    severity: GRAMMAR_ERROR_SEVERITY,
    kind: "grammar",
    message: `«${error.wrong}» → «${error.expected}»`,
    field: ENTERED_FIELD_TITLES[error.field] ?? error.field,
    wrongFragment: error.fragment,
    correctFragment: error.fragment.replace(error.wrong, error.expected),
    grammarType: GRAMMAR_TYPE_TITLES[error.type] ?? error.type,
  }));
  return [...mistakes, ...grammar];
}
