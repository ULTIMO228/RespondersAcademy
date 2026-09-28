/* Группы справочника «Внутренние номера» (spec/000-фронт/04-pages/03-arm-softphone.md «Состав»). */
export type NumberGroup = {
  id: string;
  title: string;
  matches: (number: string) => boolean;
};

const SERVICE_PREFIX = "10";
const POINT_C_PREFIX = "3";

export const NUMBER_GROUPS: NumberGroup[] = [
  {
    id: "services",
    title: "Дежурные служб (учебные номера)",
    matches: (number) => number.startsWith(SERVICE_PREFIX),
  },
  {
    id: "point-c",
    title: "Точка C — руководство служб",
    matches: (number) => number.startsWith(POINT_C_PREFIX),
  },
  {
    id: "other",
    title: "Служба 112",
    matches: (number) => !number.startsWith(SERVICE_PREFIX) && !number.startsWith(POINT_C_PREFIX),
  },
];
