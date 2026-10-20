"use client";

import type { ComponentProps, ReactNode } from "react";

import { ApplicantRow112 } from "./ApplicantRow112";
import { CardHeader112 } from "./CardHeader112";
import { CardTimer } from "./CardTimer";
import { Description112 } from "./Description112";
import { PhoneBar112 } from "./PhoneBar112";
import styles from "./Operator112Card.module.css";

export type CardFlag112 = "injured" | "ambulanceRefused" | "blocked";

type Operator112CardProps = {
  phone: ComponentProps<typeof PhoneBar112>;
  header: ComponentProps<typeof CardHeader112>;
  timer: ComponentProps<typeof CardTimer>;
  applicant: ComponentProps<typeof ApplicantRow112>;
  description: ComponentProps<typeof Description112>;
  /** Блок «Адрес:» (фича operator112-address). */
  address: ReactNode;
  flags: Record<CardFlag112, boolean>;
  onFlag: (flag: CardFlag112, value: boolean) => void;
  onNoContact: () => void;
  onDropped: () => void;
  /** Тип происшествия уже выбран: «нет контакта» / «срыв звонка» недоступны. */
  isTypeChosen?: boolean;
  disabled?: boolean;
  /** Вкладки/выбор типа происшествия под флагами (фича incident-type-picker/вкладки). */
  typeTabs?: ReactNode;
  /** Нижняя панель «Службы:» (sticky). */
  servicesBar?: ReactNode;
  /** Окна поверх вида: история SMS, напоминание, «Добавьте службы» — вид под ними не размонтируется. */
  overlays?: ReactNode;
};

const FLAGS: { key: CardFlag112; label: string }[] = [
  { key: "injured", label: "Пострадавшие" },
  { key: "ambulanceRefused", label: "Нет на месте/ Отказ от скорой" },
  { key: "blocked", label: "Нет доступа/ Заблокированные" },
];

/**
 * Каркас карточки ПОВ-112 (КАРТОЧКА_image1; спека 009, US3): сверху полоса телефонии, шапка и таймер; слева заявитель,
 * адрес, описание; справа флаги, «нет контакта» / «срыв звонка» и вкладки типа; внизу панель «Службы:».
 * Содержимое фич вставляется слотами; здесь нет ни «Режим Специалист-112», ни «Передать карточку», ни текста реплик.
 */
export function Operator112Card({
  phone,
  header,
  timer,
  applicant,
  description,
  address,
  flags,
  onFlag,
  onNoContact,
  onDropped,
  isTypeChosen = false,
  disabled = false,
  typeTabs,
  servicesBar,
  overlays,
}: Operator112CardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.card__top}>
        <PhoneBar112 {...phone} disabled={disabled || phone.disabled} />
        <CardHeader112 {...header} />
        <CardTimer {...timer} />
      </div>
      <div className={styles.card__body}>
        <div className={styles.card__left}>
          <ApplicantRow112 {...applicant} disabled={disabled || applicant.disabled} />
          {address}
          <Description112 {...description} disabled={disabled || description.disabled} />
        </div>
        <div className={styles.card__right}>
          <div className={styles.flags}>
            <div className={styles.flags__group}>
              {FLAGS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={styles.flag}
                  aria-pressed={flags[key]}
                  disabled={disabled}
                  onClick={() => onFlag(key, !flags[key])}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.flags__group}>
              <button
                type="button"
                className={[styles.flag, styles["flag--danger"]].join(" ")}
                disabled={disabled || isTypeChosen}
                onClick={onNoContact}
              >
                нет контакта
              </button>
              <button
                type="button"
                className={[styles.flag, styles["flag--danger"]].join(" ")}
                disabled={disabled || isTypeChosen}
                onClick={onDropped}
              >
                срыв звонка
              </button>
            </div>
          </div>
          {typeTabs}
        </div>
      </div>
      {servicesBar ? <div className={styles.card__services}>{servicesBar}</div> : null}
      {overlays}
    </div>
  );
}
