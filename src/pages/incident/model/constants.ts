/*
 * «Моя служба» обучающегося — дежурная служба, работающая в АРМ-112 (kind = "arm112"): диспетчер ДДС
 * отрабатывает карточку за неё (p23_Image108: у «Упр. Чертаново Южное» конверт и карандаш). Службы ВИС
 * (101–104, kind = "vis") работают в своих системах; если arm112-службы нет — первая не «только телефонная».
 */
export const MY_SERVICE_KIND = "arm112";
export const PHONE_ONLY_KIND = "phoneOnly";

/* Статусы службы, которые проставляет система: «Добавлена» (из фикстуры) и «Получена службой» (открытие). */
export const SERVICE_ADDED = "added";
export const SERVICE_RECEIVED = "received";

/*
 * Связей в фикстурах нет (расхождение №3, POST /cards/[id]/links для card-* → []). Для демонстрации блока
 * «Связи» у фикстур — статичные цепочки (главная + подчинённые); у учебных карточек — цепочка мок-слоя.
 */
export const FIXTURE_LINK_CHAINS: { main: string; subordinates: string[] }[] = [
  { main: "card-36814845", subordinates: ["card-36814859", "card-36814851"] },
  { main: "card-36814850", subordinates: ["card-36814857"] },
];

/* Query-параметры запуска карточки: время выдачи (лента занятия) и мок-блокировка дополнения (сек). */
export const ISSUED_AT_PARAM = "issuedAt";
export const AMEND_LOCK_PARAM = "amendLock";

/* Ключи «Действия диспетчера» в CardEvent.enteredText (как в mocks/sessions.json). */
export const DISPATCHER_TEXT_FIELD = "dispatcherAction";
export const DUTY_NUMBER_FIELD = "outfitNumber";

/* Автор записей журнала/истории, сделанных обучающимся (в оригинале — «оп. 0», ДДС_image10). */
export const TRAINEE_ACTOR = "оп. 0";
