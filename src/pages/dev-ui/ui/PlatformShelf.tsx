"use client";

import { useState } from "react";

import {
  AiTag,
  Alert,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  NormChart,
  PageHeader,
  Pagination,
  PlatformButton,
  ProgressBar,
  SegmentedControl,
  SelectField,
  ServerRequiredState,
  Skeleton,
  StatGroup,
  StatTile,
  Stepper,
  TabNav,
  Tag,
} from "@/shared/ui/platform";

import { DEMO_ROWS } from "../config/shelfData";

import styles from "./DevUiPage.module.css";

const MODE_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "training", label: "Тренировка" },
  { value: "exam", label: "Экзамен" },
];

/** Полка компонентов платформы (`--pf-*`, T038): все состояния для ручной проверки; симулятор их не использует. */
export function PlatformShelf() {
  const [tab, setTab] = useState("one");
  const [mode, setMode] = useState("all");
  const [page, setPage] = useState(1);
  return (
    <section className={styles.shelf__platform} aria-labelledby="platform-shelf-title">
      <h2 id="platform-shelf-title" className={styles.shelf__subtitle}>
        Компоненты платформы
      </h2>
      <PageHeader
        title="Заголовок страницы"
        description="Пояснение под заголовком"
        actions={<PlatformButton variant="primary">Главное действие</PlatformButton>}
      />
      <Card title="Кнопки, метки, уведомления" actions={<AiTag />}>
        <div className={styles.shelf__row}>
          <PlatformButton variant="primary">Основная</PlatformButton>
          <PlatformButton>Обычная</PlatformButton>
          <PlatformButton variant="ghost">Прозрачная</PlatformButton>
          <PlatformButton disabled>Недоступна</PlatformButton>
          <Tag>Нейтральная</Tag>
          <Tag tone="info">Информация</Tag>
          <Tag tone="success">Успех</Tag>
          <Tag tone="warning">Внимание</Tag>
          <Tag tone="danger">Ошибка</Tag>
        </div>
        <div className={styles.shelf__stack}>
          <Alert tone="info">Информационное сообщение</Alert>
          <Alert tone="success">Действие выполнено</Alert>
          <Alert tone="warning">Проверьте данные</Alert>
          <Alert tone="danger" role="alert">
            Не удалось выполнить действие
          </Alert>
        </div>
      </Card>
      <Card title="Поля">
        <div className={styles.shelf__row}>
          <Field label="Логин" defaultValue="ivanov" />
          <Field label="Пароль" type="password" hint="Не менее 8 символов" />
          <Field label="Комментарий" error="Комментарий обязателен" />
          <SelectField label="Режим" defaultValue="training">
            <option value="training">Тренировка</option>
            <option value="exam">Экзамен</option>
          </SelectField>
        </div>
      </Card>
      <Card title="Показатели">
        <StatGroup>
          <StatTile label="Средний балл" value="86" note="из 100" />
          <StatTile label="Реакция" value="0:24" note="норматив 0:30" tone="good" />
          <StatTile label="Отработка" value="3:45" note="норматив 3:00" tone="bad" />
        </StatGroup>
        <ProgressBar value={60} label="Выполнено 3 из 5" />
      </Card>
      <Card title="Навигация">
        <TabNav
          label="Пример вкладок"
          items={[
            { id: "one", title: "Первая" },
            { id: "two", title: "Вторая" },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        <div className={styles.shelf__row}>
          <SegmentedControl label="Режим" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </div>
        <Stepper steps={["Обучающиеся", "Режим", "Билеты", "Проверка"]} current={1} />
      </Card>
      <Card title="Таблица и страницы">
        <DataTable
          caption="Пример таблицы"
          rows={DEMO_ROWS}
          getRowKey={(row) => row.id}
          columns={[
            { key: "name", title: "ФИО", render: (row) => row.name },
            { key: "score", title: "Балл", numeric: true, render: (row) => row.score },
          ]}
        />
        <Pagination page={page} perPage={10} total={42} onChange={setPage} />
      </Card>
      <Card title="График с нормативом и таблицей-дублёром">
        <NormChart
          title="Время реакции"
          labels={["1", "2", "3", "4"]}
          values={[14, 22, 41, 18]}
          kind="bar"
          seriesName="Реакция"
          unit="с"
          norm={{ value: 30, label: "норматив 30 с" }}
          tone="reaction"
        />
      </Card>
      <div className={styles.shelf__states}>
        <Card title="Загрузка">
          <Skeleton lines={3} />
        </Card>
        <Card title="Пусто">
          <EmptyState title="Ничего не найдено" text="Измените запрос." />
        </Card>
        <Card title="Ошибка">
          <ErrorState message="Сервер не ответил" onRetry={() => undefined} />
        </Card>
        <Card title="Нужен сервер">
          <ServerRequiredState onRetry={() => undefined} />
        </Card>
      </div>
    </section>
  );
}
