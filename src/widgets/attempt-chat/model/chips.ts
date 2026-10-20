/*
 * Чипы стартовых вопросов и приветствие шторки (спека 020, US4): строятся на клиенте из модели разбора, которую экран
 * уже загрузил. Тип разбора описан структурно (виджеты одного слоя друг друга не импортируют): ReviewModel подходит.
 */

/** Минимум данных разбора, нужный чату. */
export interface ChatReviewContext {
  totalScore: number;
  errors: { type: string; message: string }[];
}

export const GENERAL_CHIP = "Как избежать этих ошибок?";
export const MAX_CHIPS = 3;
const MAX_MESSAGE_CHIP_LENGTH = 70;

const TIME_TYPES = new Set([
  "timeReactionExceeded",
  "timeProcessingExceeded",
  "timeNotCompleted",
  "timeExceeded",
]);
const SERVICE_TYPES = new Set(["wrongRecipient", "missedRequiredCall", "serviceMissing", "serviceOmitted"]);

/** 2–3 вопроса по нарушениям попытки; общий «Как избежать этих ошибок?» есть всегда и стоит последним. */
export function buildChips(review: ChatReviewContext): string[] {
  const types = new Set(review.errors.map((error) => error.type));
  const chips: string[] = [];
  if ([...types].some((type) => TIME_TYPES.has(type))) chips.push("Почему превышен норматив времени?");
  if ([...types].some((type) => SERVICE_TYPES.has(type)))
    chips.push("Почему важно передать информацию нужной службе?");
  // Остальные нарушения — по формулировке самой системы, если она короткая и читается как вопрос.
  for (const error of review.errors) {
    if (chips.length >= MAX_CHIPS - 1) break;
    if (TIME_TYPES.has(error.type) || SERVICE_TYPES.has(error.type)) continue;
    const message = error.message.trim();
    if (!message || message.length > MAX_MESSAGE_CHIP_LENGTH) continue;
    const question = `Что значит замечание: «${message}»?`;
    if (!chips.includes(question)) chips.push(question);
  }
  return [...chips.slice(0, MAX_CHIPS - 1), GENERAL_CHIP];
}

const MOD_100 = 100;
const MOD_10 = 10;

function plural(count: number, forms: [string, string, string]): string {
  const lastTwo = count % MOD_100;
  const last = count % MOD_10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  return last >= 2 && last <= 4 ? forms[1] : forms[2];
}

/** Приветствие ассистента: без запроса к модели и без бейджа источника (спека §2.2). */
export function buildGreeting(review: ChatReviewContext): string {
  const score = `${review.totalScore} ${plural(review.totalScore, ["балл", "балла", "баллов"])}`;
  const count = review.errors.length;
  const remarks =
    count === 0
      ? "замечаний не зафиксировано"
      : `зафиксировано ${count} ${plural(count, ["замечание", "замечания", "замечаний"])}`;
  return `Здравствуйте! В этой попытке вы набрали ${score}, ${remarks}. Задайте вопрос по любому пункту разбора.`;
}
