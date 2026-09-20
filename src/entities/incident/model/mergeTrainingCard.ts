/*
 * Связка моков (T2.3-01): учебная карточка занятия (IncidentCard, «c-NNN») рендерится поверх UI-фикстуры
 * своей группы ЕКП (resolvedFixtureId мок-слоя): тип, признаки, классификатор, оператор, службы — из
 * фикстуры; id/номер, заявитель и АОН, адрес, фабула — из учебной карточки. Правило общее для экрана
 * курсанта (pages/incident) и зеркала преподавателя (pages/teacher-monitor).
 */
import type { ArmCardFixtureContract, IncidentCard } from "@/shared/api";

/** Номер учебной карточки — цифры id («c-063» → 63), как в списке главного экрана (мок-слой). */
const TRAINING_ID_DIGITS = /\d+/;

export function mergeTrainingCard(
  training: IncidentCard,
  fixture: ArmCardFixtureContract,
): ArmCardFixtureContract {
  const victims = training.victims?.count ?? 0;
  return {
    ...fixture,
    id: training.id,
    number: Number(TRAINING_ID_DIGITS.exec(training.id)?.[0] ?? 0),
    smsList: undefined,
    phones: { aon: training.caller.phone, provided: training.caller.phone, onSite: "" },
    applicant: { name: training.caller.name, status: training.caller.status ?? fixture.applicant.status },
    address: {
      formal: training.address,
      okrug: "",
      raion: "",
      descriptive: training.addressRefined ?? "",
      geo: null,
    },
    what: {
      ...fixture.what,
      casualties: {
        ...fixture.what.casualties,
        injured: victims > 0,
        ambulanceRefused: Boolean(training.noAmbulance),
      },
    },
    description: training.summary,
    workLines: [],
  };
}
