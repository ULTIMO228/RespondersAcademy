import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { ServerRequired } from "@/shared/ui";

import type { Problem } from "../model/useOperator112";

import styles from "./Operator112.module.css";

const TITLES: Record<Problem["kind"], string> = {
  forbidden: "Доступ запрещён",
  notFound: "Не найдено",
  conflict: "Билет недоступен",
  serverRequired: "Раздел недоступен",
  error: "Не удалось загрузить рабочее место",
};

/** Сообщение сервера показывается дословно; возврат — к заданиям (единственный вход в режим 112). */
export function Operator112Problem({ problem }: { problem: Problem }) {
  if (problem.kind === "serverRequired") return <ServerRequired section="Режим «Специалист-112»" />;
  return (
    <section className={styles.problem} role="alert" data-kind={problem.kind}>
      <h1 className={styles.problem__title}>{TITLES[problem.kind]}</h1>
      <p>{problem.message}</p>
      <Link href={ROUTES.studentAssignments} className={styles.problem__link}>
        К заданиям
      </Link>
    </section>
  );
}

/** Прямая ссылка на /arm/operator112 без assignmentId: пояснение вместо пустого экрана. */
export function Operator112Missing() {
  return (
    <section className={styles.problem} role="status" data-kind="missing">
      <h1 className={styles.problem__title}>Режим «Специалист-112»</h1>
      <p>Откройте задание из раздела заданий: вызов выдаётся только в рамках задания.</p>
      <Link href={ROUTES.studentAssignments} className={styles.problem__link}>
        К заданиям
      </Link>
    </section>
  );
}
