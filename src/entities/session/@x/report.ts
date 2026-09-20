/* Кросс-импорт для entities/report (FSD @x): нормативы таймингов и разбор эталона для мок-оценки попытки. */
export { isNormExceeded, resolveTimeNorms } from "../model/timings";
export type { TimeNormsMs } from "../model/timings";
export { getCardEtalonSegment, parseEtalonAction } from "../lib/etalonActions";
