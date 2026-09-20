import Link from "next/link";

import { formatDate, formatTime } from "@/shared/lib";
import { Button, TimerBadge } from "@/shared/ui";

import { CardIcon } from "./CardIcon";

import styles from "./CardHeader.module.css";

type CardHeaderProps = {
  number: number;
  createdAt: string;
  registeredBy: string;
  isExceeded: boolean;
  timerValue: string;
  reactionValue: string;
  stateToggleHref?: string;
  readOnly?: boolean;
  /** Норматив 30 сек нарушен — без ✓, подпись красным. */
  isReactionExceeded?: boolean;
  /** ВИС-карточка: нет номера АРМ оператора, показывается источник (памятка стр. 14). */
  isFromVis?: boolean;
  /** Живой режим: «просмотр» (Shift+F1) / «дополнение» (Shift+F2). */
  onViewClick?: () => void;
  onAmendClick?: () => void;
  isAmendActive?: boolean;
  isAmendDisabled?: boolean;
};

const TIMER_CAPTION = "минут секунд";
const VIS_OPERATOR_NOTE = "АРМ оператора: нет данных (карточка из ВИС)";

/**
 * Шапка карточки: «Происшествие N / Сохр. … / Опер. …», тренажёрный таймер отработки 3:00 с индикатором
 * норматива 30 сек и кнопки «просмотр» / «дополнение». При превышении норматива красные таймер и вся шапка.
 */
export function CardHeader(props: CardHeaderProps) {
  const { number, createdAt, registeredBy, isExceeded, timerValue, reactionValue, stateToggleHref } = props;
  const { readOnly, isReactionExceeded = false, isFromVis = false, isAmendActive = false } = props;
  const timer = <TimerBadge value={timerValue} exceeded={isExceeded} size="lg" caption={TIMER_CAPTION} />;
  const reactionLabel = isReactionExceeded
    ? `Норматив 30 сек нарушен: ${reactionValue}`
    : `Норматив 30 сек выполнен: ${reactionValue}`;
  return (
    <div
      className={[styles.header, isExceeded ? styles["header--exceeded"] : ""].join(" ")}
      data-exceeded={isExceeded}
    >
      <div className={styles.header__info} data-testid="card-header">
        <h1 className={styles.header__title}>Происшествие {number}</h1>
        <span>
          Сохр. {formatDate(createdAt)} в {formatTime(createdAt)}
        </span>
        <span className={styles.header__operator} title={isFromVis ? VIS_OPERATOR_NOTE : registeredBy}>
          {isFromVis ? `ВИС: ${registeredBy}` : registeredBy}
        </span>
      </div>
      <div className={styles.header__timer}>
        {stateToggleHref ? (
          <Link
            href={stateToggleHref}
            className={styles.header__toggle}
            title={isExceeded ? "Показать состояние «в норме»" : "Показать превышение норматива"}
          >
            {timer}
          </Link>
        ) : (
          timer
        )}
        <span
          className={[
            styles.header__reaction,
            isReactionExceeded ? styles["header__reaction--late"] : "",
          ].join(" ")}
          aria-label={reactionLabel}
        >
          Реакция: {reactionValue}
          {isReactionExceeded ? null : <CardIcon name="check" size={14} className={styles.header__check} />}
        </span>
      </div>
      <div className={styles.header__actions}>
        <Button
          variant="blue"
          className={styles.header__button}
          title="Просмотр (Shift + F1)"
          disabled={readOnly}
          onClick={props.onViewClick}
          aria-pressed={props.onViewClick ? !isAmendActive : undefined}
        >
          просмотр
        </Button>
        <Button
          variant="dark"
          className={styles.header__button}
          title="Дополнить (Shift + F2)"
          disabled={readOnly || props.isAmendDisabled}
          onClick={props.onAmendClick}
          aria-pressed={props.onAmendClick ? isAmendActive : undefined}
        >
          дополнение
        </Button>
      </div>
    </div>
  );
}
