import { buildFlowDictionaries } from "../lib/buildDictionaries";
import { ConstructorScreen } from "./ConstructorScreen";

/**
 * `/teacher/constructor` — визуальный конструктор сценариев (фича 005, кликабельный прототип). Серверный компонент:
 * справочники (банк билетов, статусы, службы, признаки ЕКП) собираются из моков и передаются экрану пропсами.
 * Доступ — лэйаут преподавателя (verifySession + роль teacher).
 */
export function TeacherConstructorPage() {
  return <ConstructorScreen dictionaries={buildFlowDictionaries()} />;
}
