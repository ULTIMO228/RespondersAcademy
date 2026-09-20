"use client";

import Link from "next/link";
import { useState } from "react";

import { ROUTES } from "@/shared/config";
import { Button } from "@/shared/ui";

import { PHONE_MASK_TEMPLATE } from "../config/constants";
import { applyPhoneInput, formatPhoneMask } from "../lib/phoneMask";
import type { WorkLinesControl } from "../model/types";
import { isInternalNumber, useWorkLineForm } from "../model/useWorkLineForm";
import { CardIcon } from "./CardIcon";
import { ServiceSearchField } from "./ServiceSearchField";

import styles from "./AddWorkLineForm.module.css";

type AddWorkLineFormProps = {
  serviceNames: string[];
  /** Живой режим: сохранение через POST /api/mock/cards/[id]/worklines. */
  control?: WorkLinesControl;
};

/**
 * Форма «Добавить отработку» (p16_Image77, spec п. 12): Служба (поиск по списку) / Куда звонили / Телефон /
 * Кто принял / Суть сообщения, кнопка вызова (софтфон) и подтверждающая галочка — без неё не сохраняется.
 */
export function AddWorkLineForm({ serviceNames, control }: AddWorkLineFormProps) {
  const [isOpen, setOpen] = useState(false);
  const form = useWorkLineForm(control);
  const { values, setField } = form;
  const callHref = control ? control.buildCallHref(values.phone) : ROUTES.armPhone;

  if (!isOpen) {
    return (
      <div>
        <Button size="sm" onClick={() => setOpen(true)} title="Добавить отработку (Alt + O)">
          Добавить отработку
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.form} role="group" aria-label="Добавить отработку">
      <button
        type="button"
        className={styles.form__close}
        onClick={() => setOpen(false)}
        aria-label="Свернуть форму отработки"
      >
        <CardIcon name="close" size={18} />
      </button>
      <ServiceSearchField serviceNames={serviceNames} value={values.service} onSelect={form.selectService} />
      <input
        className={styles.form__field}
        aria-label="Куда звонили"
        placeholder="куда"
        value={values.calledTo}
        onChange={(event) => setField("calledTo", event.target.value)}
      />
      <input
        className={styles.form__field}
        aria-label="Телефон"
        placeholder={PHONE_MASK_TEMPLATE}
        inputMode="tel"
        value={isInternalNumber(values.phone) ? values.phone : formatPhoneMask(values.phone)}
        onChange={(event) => setField("phone", applyPhoneInput(values.phone, event.target.value))}
      />
      <Link
        href={callHref}
        className={styles.form__call}
        aria-label="Позвонить (софтфон)"
        title="Позвонить (софтфон)"
      >
        <CardIcon name="phone" size={20} />
      </Link>
      <input
        className={styles.form__field}
        aria-label="Кто принял"
        placeholder="кто принял"
        value={values.person}
        onChange={(event) => setField("person", event.target.value)}
      />
      <input
        className={[styles.form__field, styles["form__field--wide"]].join(" ")}
        aria-label="Суть сообщения"
        placeholder="суть сообщения"
        value={values.message}
        onChange={(event) => setField("message", event.target.value)}
      />
      <button
        type="button"
        className={[styles.form__confirm, values.confirmed ? styles["form__confirm--checked"] : ""].join(" ")}
        aria-pressed={values.confirmed}
        aria-label="Подтвердить отработку"
        title="Подтвердить отработку — без галочки отработка не сохраняется"
        onClick={() => setField("confirmed", !values.confirmed)}
      >
        <CardIcon name="check" size={20} />
      </button>
      {control ? (
        <Button
          size="sm"
          variant="blue"
          onClick={() => void form.save()}
          disabled={!form.canSave || form.isSaving}
        >
          Сохранить
        </Button>
      ) : null}
      {form.error ? (
        <span className={styles.form__error} role="alert">
          {form.error}
        </span>
      ) : null}
    </div>
  );
}
