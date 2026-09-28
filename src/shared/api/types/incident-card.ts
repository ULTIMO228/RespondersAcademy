/*
 * Учебная карточка (входная задача курсанта) — spec/000-фронт/05-data-models.md §4 (mocks/cards.json).
 * Пространство id: "c-001" … "c-096" (порядок = билет.ситуация). НЕ путать с ArmCardFixture ("card-*").
 */
import type { CallerStatus } from "./reference";

/** Id учебной карточки: "c-NNN". */
export type IncidentCardId = string;

export interface IncidentCaller {
  name: string;
  phone: string;
  status?: CallerStatus;
}

export interface IncidentVictims {
  count: number;
  note?: string;
}

export interface IncidentCard {
  id: IncidentCardId;
  /** 1..32 — номер билета. */
  ticketNo: number;
  situationNo: 1 | 2 | 3;
  /** Группа происшествия (ReferenceData.incidentGroups). */
  group: string;
  /** Фабула. */
  summary: string;
  address: string;
  addressRefined?: string;
  caller: IncidentCaller;
  victims?: IncidentVictims;
  /** «03 не требуется». */
  noAmbulance?: boolean;
  /** Вызов из другого региона. */
  crossRegion?: boolean;
  /** ЭТАЛОН: службы по классификатору. */
  expectedServices: string[];
  /** ЭТАЛОН: теги опросной карты. */
  expectedTags: string[];
  /** Id карточки-оригинала (дубли датасета) — источник read-only связей. */
  duplicateOf?: IncidentCardId;
  /** [расширение] автор-обучающийся — пул для cardSource='studentCreated'. */
  createdByStudentId?: string;
}
