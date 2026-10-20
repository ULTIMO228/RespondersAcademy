import styles from "./CardHeader112.module.css";

type CardHeader112Props = {
  number: number | string;
  /** Уже отформатированные «17.09.2026 в 11:38:33». */
  savedAt: string;
  /** «Опер. , АРМ 4, УМЦ О n». */
  operatorLine: string;
};

/** Шапка карточки ПОВ-112: «Происшествие N · Сохр. … · Опер., АРМ …» (КАРТОЧКА_image1; спека 009, FR-012). */
export function CardHeader112({ number, savedAt, operatorLine }: CardHeader112Props) {
  return (
    <div className={styles.header} data-testid="card-header">
      <h1 className={styles.header__title}>Происшествие {number}</h1>
      <span>Сохр. {savedAt}</span>
      <span>{operatorLine}</span>
    </div>
  );
}
