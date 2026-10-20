import styles from "./LockedWindow.module.css";

type Props = { operator: number; name: string; arm: number };

/** Оранжевое окно блокировки карточки, занятой другим оператором (FR-028, ИНСТРУКЦИЯ_94). */
export function LockedWindow({ operator, name, arm }: Props) {
  return (
    <div className={styles.window} role="alert">
      <div className={styles.title}>Вы не можете вносить изменения</div>
      <div className={styles.body}>
        В данный момент карточка заполняется пользователем:
        <br />
        Оп. {operator} {name}; АРМ {arm}
      </div>
    </div>
  );
}
