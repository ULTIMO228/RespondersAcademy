"use client";

import { useState } from "react";

import {
  AiBadge,
  ArmIcon,
  BarChart,
  Button,
  Chip,
  Input,
  LineChart,
  Modal,
  Panel,
  Select,
  StatusChip,
  Table,
  TimerBadge,
  Toggle,
} from "@/shared/ui";

import { DEMO_ICONS, DEMO_ROWS, DEMO_STATUSES } from "../config/shelfData";

import styles from "./DevUiPage.module.css";

/** Полка UI-примитивов: все состояния для ручной проверки (T0.1-09, T0.1-10). */
export function DevUiPage() {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isAutoRefresh, setAutoRefresh] = useState(true);
  const [isChipSelected, setChipSelected] = useState(true);
  return (
    <div className={styles.shelf}>
      <h1 className={styles.shelf__title}>Полка UI-примитивов</h1>
      <Panel title="Кнопки">
        <div className={styles.shelf__row}>
          <Button variant="primary">сохранить</Button>
          <Button variant="secondary">сбросить</Button>
          <Button variant="danger">Отклонить</Button>
          <Button variant="blue">просмотр</Button>
          <Button variant="dark">дополнение</Button>
          <Button variant="secondary" disabled>
            неактивна
          </Button>
          <Button variant="primary" size="lg" onClick={() => setModalOpen(true)}>
            Открыть модалку
          </Button>
        </div>
      </Panel>
      <Panel title="Поля">
        <div className={styles.shelf__row}>
          <Input label="логин:" defaultValue="ivanov" />
          <Input label="Номер наряда" placeholder="Номер наряда" />
          <Input label="Комментарий" error="Комментарий обязателен" />
          <Select label="Статус" placeholder="Статус" options={[{ value: "accepted", label: "Принята" }]} />
          <Toggle label="автообновление" checked={isAutoRefresh} onChange={setAutoRefresh} />
        </div>
        <div className={styles.shelf__row}>
          <Chip selected={isChipSelected} onClick={() => setChipSelected(!isChipSelected)}>
            Дом
          </Chip>
          <Chip>Улица</Chip>
          <Chip disabled>Транспорт</Chip>
          <AiBadge />
        </div>
      </Panel>
      <Panel title="Статусы и таймеры">
        <div className={styles.shelf__row}>
          {DEMO_STATUSES.map((status) => (
            <StatusChip key={status.title} label={status.title} tone={status.tone} />
          ))}
          <StatusChip label="Добавлена" tone="new" marker="added" />
        </div>
        <div className={styles.shelf__row}>
          <TimerBadge value="0:30" caption="Реакция" />
          <TimerBadge value="0:00" exceeded caption="Реакция" />
          <TimerBadge value="3:00" size="lg" caption="Отработка" />
          <TimerBadge value="3:12" size="lg" exceeded caption="Отработка" />
        </div>
      </Panel>
      <Panel title="Иконки АРМ-112 (icons/)">
        <div className={styles.shelf__row}>
          {DEMO_ICONS.map((name) => (
            <span key={name} className={styles.shelf__icon}>
              <ArmIcon name={name} size={24} />
              <code>{name}</code>
            </span>
          ))}
        </div>
      </Panel>
      <Panel title="Таблица">
        <Table
          caption="Пример таблицы"
          getRowKey={(row) => row.id}
          rows={DEMO_ROWS}
          columns={[
            { key: "name", title: "ФИО", render: (row) => row.name },
            { key: "arm", title: "АРМ", render: (row) => row.arm, align: "center" },
            { key: "score", title: "Балл", render: (row) => row.score, align: "right" },
          ]}
        />
      </Panel>
      <div className={styles.shelf__charts}>
        <BarChart
          title="Интегральный балл"
          labels={["Иванов", "Петрова", "Сидорова"]}
          values={[96, 71, 58]}
        />
        <LineChart
          title="Время реакции"
          unit="с"
          labels={["1", "2", "3", "4"]}
          series={[{ name: "Реакция", values: [14, 22, 41, 18] }]}
          norms={[{ value: 30, label: "норматив 30 с" }]}
        />
      </div>
      {isModalOpen ? (
        <Modal
          title="Добавьте службы"
          onClose={() => setModalOpen(false)}
          footer={<Button onClick={() => setModalOpen(false)}>Сохранить и закрыть</Button>}
        >
          Содержимое модального окна.
        </Modal>
      ) : null}
    </div>
  );
}
