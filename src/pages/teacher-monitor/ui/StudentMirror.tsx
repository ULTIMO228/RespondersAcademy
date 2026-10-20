import { IncidentCardView } from "@/widgets/incident-card";
import { ServicePanel } from "@/widgets/service-panel";
import type {
  ArmCardFixtureContract,
  ClassifierEntry,
  OperatorAttempt,
  DdsStatusDef,
  ServiceRef,
} from "@/shared/api";
import type { ServiceStatusDef } from "@/shared/api";

import { Operator112Mirror } from "./Operator112Mirror";

import styles from "./StudentMirror.module.css";

type DdsMirrorProps = {
  mode?: "dds";
  card: ArmCardFixtureContract;
  classifierEntries: ClassifierEntry[];
  services: ServiceRef[];
  serviceStatuses: ServiceStatusDef[];
  ddsStatuses: DdsStatusDef[];
  myServiceId?: string;
  isExceeded: boolean;
  /** Живые таймеры курсанта: отработка и выполненная первичная реакция. */
  timerValue?: string;
  reactionValue?: string;
  /** Текущий статус ДДС курсанта — панель служб показывает его без возможности смены. */
  currentDdsStatus?: string | null;
};

/** Зеркало рабочего места специалиста 112 (FR-015): попытка 112 или null, если данных нет. */
type Operator112MirrorModeProps = {
  mode: "operator112";
  attempt: OperatorAttempt | null;
};

type StudentMirrorProps = DdsMirrorProps | Operator112MirrorModeProps;

/**
 * Read-only зеркало АРМ курсанта: тот же рендер карточки и панели служб, что у курсанта (ре-use виджетов),
 * состояние — из событий ленты занятия (не видеострим). `fieldset disabled` гарантирует, что ни один
 * контрол зеркала не активен (ТЗ §8 — без вмешательства); `transform` делает обёртку контейнером для
 * fixed-панели служб, чтобы она не перекрывала страницу.
 */
export function StudentMirror(props: StudentMirrorProps) {
  if (props.mode === "operator112") return <Operator112Mirror attempt={props.attempt} />;
  return <DdsStudentMirror {...props} />;
}

function DdsStudentMirror({
  card,
  classifierEntries,
  services,
  serviceStatuses,
  ddsStatuses,
  myServiceId,
  isExceeded,
  timerValue,
  reactionValue,
  currentDdsStatus,
}: DdsMirrorProps) {
  return (
    <fieldset className={styles.mirror} disabled aria-label="Зеркало экрана курсанта — только просмотр">
      <legend className="visually-hidden">Экран курсанта (только просмотр)</legend>
      <div className={styles.mirror__screen} data-theme="light">
        <IncidentCardView
          card={card}
          classifierEntries={classifierEntries}
          linkedCards={[]}
          isExceeded={isExceeded}
          timerValue={timerValue}
          reactionValue={reactionValue}
          readOnly
        />
        <div className={styles.mirror__services}>
          <ServicePanel
            card={card}
            services={services}
            serviceStatuses={serviceStatuses}
            ddsStatuses={ddsStatuses}
            myServiceId={myServiceId}
            currentDdsStatus={currentDdsStatus}
            readOnly
          />
        </div>
      </div>
    </fieldset>
  );
}
