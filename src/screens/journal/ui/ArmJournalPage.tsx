import styles from "./ArmJournalPage.module.css";

type Incident = {
  arm: string;
  number: string;
  time: string;
  type: string;
  address: string;
  description: string;
  code?: string;
};

const incidents: Incident[] = [
  {
    arm: "4",
    number: "36814848",
    time: "11:16:53",
    type: "ДТП",
    address: "",
    description: "17.09.2026 11:18:12 УМЦ О.п. — ДТП, столкнулись 2 автомобиля гс номера 223 АНО, разлитие топлива, есть пострадавшие",
  },
  {
    arm: "4",
    number: "36814845",
    time: "11:12:43",
    type: "101",
    address: "Москва, (ТАО, Вороновское), Троицкий административный округ",
    description: "17.09.2026 11:13:19 УМЦ О.п. — Пожар в квартире",
    code: "101",
  },
  {
    arm: "4",
    number: "36814844",
    time: "11:11:01",
    type: "",
    address: "",
    description: "17.09.2026 11:11:37 УМЦ О.п. — ТЕСТ 1",
  },
];

function SearchIcon() {
  return <img className={styles.searchIconImage} src="/icons/search.svg" alt="" />;
}

function WorkstationIcons() {
  return (
    <span className={styles.workstationIcons} aria-hidden="true">
      <img src="/icons/top-monitor.svg" alt="" />
      <img src="/icons/top-settings.svg" alt="" />
      <img src="/icons/top-info.svg" alt="" />
      <img src="/icons/top-exit.svg" alt="" />
    </span>
  );
}

function RowTools() {
  return (
    <span className={styles.cellIcons} role="cell">
      <span className={styles.utilityIcon}><img src="/icons/row-expand.svg" alt="Развернуть" /></span>
      <span className={styles.utilityIcon} />
      <span className={styles.utilityIcon}><img src="/icons/row-bookmark.svg" alt="Закладка" /></span>
      <span className={styles.utilityIcon}><img src="/icons/row-important.svg" alt="Важное происшествие" /></span>
      <span className={styles.utilityIcon}><img src="/icons/row-reminder.svg" alt="Напоминание" /></span>
    </span>
  );
}

function ServiceStatusIcon() {
  return <img className={styles.serviceStatusImage} src="/icons/service-status.svg" alt="" />;
}

function ClipboardIcon() {
  return <img className={styles.clipboardImage} src="/icons/clipboard.svg" alt="Журнал" />;
}

export function ArmJournalPage() {
  return (
    <main className={styles.page}>
      <section className={styles.searchArea} aria-label="Поиск происшествий">
        <div className={styles.searchMain}>
          <div className={styles.titleRow}>
            <h1>Поиск происшествий</h1>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
          </div>
          <div className={styles.searchActions}>
            <button type="button" className={styles.advancedButton}>
              расширенный по параметрам <img src="/icons/advanced-chevron.svg" alt="" />
            </button>
            <button type="button" className={styles.resetButton}>сбросить</button>
          </div>
        </div>

        <aside className={styles.operatorPanel} aria-label="Рабочее место оператора">
          <div className={styles.operatorInfo}>
            <strong>Четверг, 17 Сентябрь 2026</strong>
            <span className={styles.workstationLine}>, УМЦ О.п. <WorkstationIcons /></span>
          </div>
          <time className={styles.clock} dateTime="2026-09-17T11:24:26+03:00">
            11:24<sup>:26</sup>
          </time>
        </aside>
      </section>

      <section className={styles.journal} aria-labelledby="incident-list-title">
        <header className={styles.journalHeader}>
          <h2 id="incident-list-title">Список происшествий <img src="/icons/section-collapse.svg" alt="" /></h2>
          <div className={styles.listControls}>
            <span className={styles.notification}><img src="/icons/notification.svg" alt="" /> уведомления</span>
            <span className={styles.showSelect}>выберите что показать <img src="/icons/filter-chevron.svg" alt="" /></span>
          </div>
        </header>

        <div className={styles.tableHeader} aria-hidden="true">
          <span className={styles.actionLabels}><i>Связи</i><i>ЧС</i></span><span>Опер.</span><span>АРМ</span><span>Номер</span><span className={styles.dateHeading}>Дата <img src="/icons/sort-down.svg" alt="по убыванию" /></span><span>Время</span><span>Тип происшествия</span><span>Постр.</span><span>Адрес</span><span>Статус службы</span><span />
        </div>

        <div className={styles.rows} role="table" aria-label="Список происшествий">
          {incidents.map((incident) => (
            <div className={styles.incidentGroup} role="rowgroup" key={incident.number}>
              <div className={styles.incidentRow} role="row">
                <RowTools />
                <span className={styles.operatorCell} role="cell">0</span>
                <span role="cell">{incident.arm}</span>
                <span role="cell">{incident.number}</span>
                <span role="cell">17.09.26</span>
                <strong className={styles.timeCell} role="cell">{incident.time}</strong>
                <strong className={styles.typeCell} role="cell">
                  {incident.type}
                  {incident.code && <i className={styles.codeTooltip} aria-hidden="true">{incident.code}</i>}
                </strong>
                <span role="cell">Нет</span>
                <strong className={styles.addressCell} role="cell">{incident.address}</strong>
                <span className={styles.serviceCell} role="cell"><ServiceStatusIcon /> Добавлена</span>
                <span className={styles.clipboardCell} role="cell"><ClipboardIcon /></span>
              </div>
              <div className={styles.descriptionRow} role="row">
                <strong>Описание:</strong><span>{incident.description}</span>
              </div>
            </div>
          ))}
        </div>

        <footer className={styles.pagination}>
          <span>Страница: &nbsp;1 <img src="/icons/page-dropdown.svg" alt="" /></span>
          <span>Записей на странице: &nbsp;10 <img src="/icons/page-size-dropdown.svg" alt="" /></span>
          <strong>1-{incidents.length} из {incidents.length}</strong>
          <button type="button" aria-label="Предыдущая страница"><img src="/icons/pagination-prev.svg" alt="" /></button>
          <button type="button" aria-label="Следующая страница"><img src="/icons/pagination-next.svg" alt="" /></button>
        </footer>
      </section>
    </main>
  );
}
