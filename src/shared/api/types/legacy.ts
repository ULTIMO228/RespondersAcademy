/*
 * Имена волны 0 (прототип), на которых сидит UI. Теперь это алиасы контрактных типов spec/000-фронт/05-data-models.md.
 * Новому коду — использовать контрактные имена.
 */
import type { ServiceNotification } from "./classifier";
import type { IncidentCard } from "./incident-card";
import type { CardStatusDef } from "./reference";
import type { Role } from "./user";

/** @deprecated → Role */
export type UserRole = Role;
/** @deprecated → CardStatusDef */
export type CardStatusRef = CardStatusDef;
/** @deprecated → IncidentCard */
export type TrainingCard = IncidentCard;
/** @deprecated → ServiceNotification */
export type ClassifierNotification = ServiceNotification;
