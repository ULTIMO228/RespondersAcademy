/*
 * Единая точка входа статичных мок-данных прототипа (волна 0).
 * Компоненты не импортируют JSON напрямую — только отсюда; в волне 1 модуль заменяется
 * клиентом мок-слоя /api/mock/* без переписывания компонентов.
 * Импортировать runtime-значения только в серверных компонентах (без "use client"),
 * в клиентские компоненты данные передаются пропсами (`import type` допустим везде).
 */
import armCardsJson from "@mocks/fixtures/arm-cards.json";
import cardsJson from "@mocks/cards.json";
import classifierJson from "@mocks/classifier.json";
import referenceJson from "@mocks/reference.json";
import reportsJson from "@mocks/reports.json";
import scenariosJson from "@mocks/scenarios.json";
import sessionsJson from "@mocks/sessions.json";
import usersJson from "@mocks/users.json";

import type { ArmCardFixture, Report, Session } from "./prototype-types";
import type { ClassifierEntry, GroupReport, IncidentCard, ReferenceData, Scenario, User } from "./types";

/* JSON приводится к контрактным типам spec/05-data-models.md; соответствие проверяют readers.test.ts. */
export const users = usersJson.users as User[];
export const reference = referenceJson as ReferenceData;
export const classifier = classifierJson.entries as ClassifierEntry[];
export const cards = cardsJson.cards as IncidentCard[];
export const scenarios = scenariosJson.scenarios as Scenario[];
export const sessions: Session[] = sessionsJson.sessions;
export const reports: Report[] = reportsJson.reports;
export const groupReport = reportsJson.groupReport as GroupReport;
export const armCardFixtures: ArmCardFixture[] = armCardsJson.cards;
