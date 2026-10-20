"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MouseEvent } from "react";

import { useOpenAttempt } from "@/entities/operator112-attempt";
import { SPECIALIZATION_TITLES, ZONE_HOME } from "@/entities/user";
import type { Specialization } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button, Modal } from "@/shared/ui";
import { ReferenceToggle } from "@/features/arm-reference";

import { SIMULATOR_BAR_SLOT_ID } from "../config";

import styles from "./SimulatorBar.module.css";

type SimulatorBarProps = {
  /** Зоны, доступные обучающемуся; при двух специализациях в панели появляется переключатель зон. */
  zones?: Specialization[];
  /** Зона открытого экрана — её роль подписана в панели. */
  currentZone?: Specialization;
};

/**
 * Панель «В кабинет» над экранами симулятора. Единственное добавление к виду `/arm/*` (правило №1, T039); оформлена в
 * токенах АРМ. Открытая попытка сохраняется на сервере, поэтому выход в кабинет ничего не теряет. Кнопка
 * «Справочник» (спека 005) стоит в правом краю и открывает справочник окошком поверх АРМ; при запрете в задании её нет.
 * Слот — учебные показатели экрана (норматив, лимит, подсказка; спеки 009 и 012, FR-002). Один элемент на оба
 * механизма: SimulatorBarPortal (112, без полосы рисует на месте) и SimulatorBarSlot (ДДС, без полосы не рисует).
 * Обучающийся с двумя специализациями видит здесь подпись текущей роли и ссылку на вторую зону (спека 007); с одной —
 * панель прежняя. При открытой попытке смена зоны требует подтверждения (FR-014): попытка не прерывается, она сохранена
 * на сервере.
 */
export function SimulatorBar({ zones = [], currentZone }: SimulatorBarProps) {
  const router = useRouter();
  const openAttempt = useOpenAttempt();
  const [pending, setPending] = useState<Specialization | null>(null);
  /** Открытая попытка: смена зоны только после явного подтверждения (FR-014). */
  const onZoneClick = (zone: Specialization) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!openAttempt) return;
    event.preventDefault();
    setPending(zone);
  };
  const others = zones.filter((zone) => zone !== currentZone);
  const showSwitch = currentZone !== undefined && zones.length > 1;
  return (
    <div className={styles.bar} data-simulator-bar>
      <Link className={styles.bar__link} href={ROUTES.studentHome}>
        ← В кабинет
      </Link>
      {showSwitch ? (
        <nav className={styles.bar__zones} aria-label="Рабочая зона">
          <span className={styles.bar__role}>{SPECIALIZATION_TITLES[currentZone]}</span>
          {others.map((zone) => (
            <Link key={zone} className={styles.bar__zone} href={ZONE_HOME[zone]} onClick={onZoneClick(zone)}>
              {SPECIALIZATION_TITLES[zone]}
            </Link>
          ))}
        </nav>
      ) : null}
      <div id={SIMULATOR_BAR_SLOT_ID} className={styles.bar__slot} data-simulator-bar-slot />
      <span className={styles.bar__hint}>Учебный режим · открытая попытка сохраняется</span>
      <ReferenceToggle />
      {pending && currentZone && openAttempt ? (
        <Modal
          title="Смена рабочей зоны"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)}>
                Остаться
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = pending;
                  setPending(null);
                  router.push(ZONE_HOME[target]);
                }}
              >
                Перейти: {SPECIALIZATION_TITLES[pending]}
              </Button>
            </>
          }
        >
          <p>
            Вы работаете как «{SPECIALIZATION_TITLES[currentZone]}», попытка не завершена: {openAttempt.title}
            . Переход в роль «{SPECIALIZATION_TITLES[pending]}» не закроет её — она сохранится на сервере, и к
            ней можно вернуться.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
