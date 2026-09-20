"use client";

import { useState } from "react";

import { EMPTY_APPLICANT_LABEL, VIS_EMPTY_APPLICANT_LABEL } from "../config/constants";
import type { FlagsControl, IncidentCardData } from "../model/types";
import { CardIcon } from "./CardIcon";

import styles from "./ApplicantRow.module.css";

type ApplicantRowProps = {
  applicant: IncidentCardData["applicant"];
  casualties: IncidentCardData["what"]["casualties"];
  emergency: IncidentCardData["emergency"];
  isFromVis?: boolean;
  /** Живой режим: ЧС/ЧП переключаются после карандаша, если сценарий разрешает редактирование. */
  flags?: FlagsControl;
  isLocked?: boolean;
};

function toYesNo(value: boolean): string {
  return value ? "да" : "нет";
}

/**
 * Строка заявителя («Иванов очевидец») и флаги «Пострадавшие / Отказ от скорой / Заблокированные»
 * + кнопки «ЧС» (молния), «ЧП» (треугольник), карандаш (ДДС_image6, p23_Image108).
 */
export function ApplicantRow(props: ApplicantRowProps) {
  const { applicant, casualties, isFromVis = false, flags, isLocked = false } = props;
  const [isEditing, setEditing] = useState(false);
  const emergency = flags?.emergency ?? props.emergency;
  const canEdit = Boolean(flags?.canEdit) && !isLocked;
  const isFlagEditable = canEdit && isEditing;
  const editTitle = canEdit
    ? "Изменить (Alt + E)"
    : "Изменить (Alt + E) — редактирование запрещено сценарием";

  return (
    <div className={styles.row}>
      <div className={styles.row__applicant}>
        {applicant.name ? (
          <>
            <span className={styles.row__name}>{applicant.name}</span>
            <span className={styles.row__status}>{applicant.status}</span>
          </>
        ) : (
          <span className={styles.row__placeholder}>
            {isFromVis ? VIS_EMPTY_APPLICANT_LABEL : EMPTY_APPLICANT_LABEL}
          </span>
        )}
      </div>
      <div className={styles.row__right}>
        <p className={styles.row__flags}>
          <span>Пострадавшие: {toYesNo(casualties.injured)}</span>
          <span>Отказ от скорой: {toYesNo(casualties.ambulanceRefused)}</span>
          <span>Заблокированные: {toYesNo(casualties.blocked)}</span>
        </p>
        <div className={styles.row__buttons}>
          <button
            type="button"
            className={[styles.row__flag, emergency.chs ? styles["row__flag--chs"] : ""].join(" ")}
            aria-pressed={emergency.chs}
            disabled={!isFlagEditable}
            onClick={() => flags?.onToggle("chs")}
            title="ЧС — чрезвычайная ситуация"
          >
            ЧС <CardIcon name="lightning" size={18} />
          </button>
          <button
            type="button"
            className={[styles.row__flag, emergency.chp ? styles["row__flag--chp"] : ""].join(" ")}
            aria-pressed={emergency.chp}
            disabled={!isFlagEditable}
            onClick={() => flags?.onToggle("chp")}
            title="ЧП — чрезвычайное происшествие"
          >
            ЧП <CardIcon name="warning" size={18} />
          </button>
          <button
            type="button"
            className={styles.row__edit}
            disabled={!canEdit}
            aria-pressed={canEdit ? isEditing : undefined}
            aria-label="Изменить (Alt + E)"
            title={editTitle}
            onClick={() => setEditing((editing) => !editing)}
          >
            <CardIcon name="pencil" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
