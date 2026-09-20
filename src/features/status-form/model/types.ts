/** Пункт дропдауна «Статус»: недоступные по последовательности показываются неактивными. */
export type StatusOption = {
  status: string;
  title: string;
  isAvailable: boolean;
  requiresComment: boolean;
  /** «Работы завершены» / «Отказ…» закрывают карточку для редактирования (памятка стр. 22). */
  isFinal: boolean;
};

export type StatusFormValues = {
  status: string;
  dutyNumber: string;
  comment: string;
};

/** Справочная запись статуса (reference.json → ddsStatuses / serviceStatuses). */
export type StatusSequenceRef = {
  status: string;
  title: string;
  requiresComment: boolean;
  next: string[];
};
