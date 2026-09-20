/* Значения по умолчанию конструктора сценариев (spec/04-pages/11, spec/05-data-models.md §6). */
import { PROCESSING_NORM_SEC, REACTION_NORM_SEC } from "@/entities/session";
import type { ScenarioCreateRequest } from "@/shared/api";

/** Категория для первого открытия диалога «Сгенерировать (ИИ)» (демо-путь: ДТП с пострадавшими). */
export const DEFAULT_GENERATE_GROUP = "Дорожно-транспортные происшествия с пострадавшими";

const DEFAULT_MAX_GRAMMAR_ERRORS = 1;

/** Черновик «Создать сценарий»: шаблон на базе карточки, нормативы 30 / 180 сек, режим practice. */
export function buildDraftScenario(title: string, cardId: string, ticketNo: number): ScenarioCreateRequest {
  return {
    title,
    level: "beginner",
    sourceTicketNo: ticketNo,
    cardIds: [cardId],
    timeNorms: { primaryReactionSec: REACTION_NORM_SEC, fullProcessingSec: PROCESSING_NORM_SEC },
    hints: { enabled: false, texts: [] },
    difficulty: 1,
    etalon: { expectedActions: [], keyPhrases: [] },
    successCriteria: {
      maxGrammarErrors: DEFAULT_MAX_GRAMMAR_ERRORS,
      requiredFields: ["dispatcherAction", "outfitNumber"],
      syntaxRequirements: "Полные предложения, без сокращений",
    },
    source: "template",
    mode: "practice",
  };
}
