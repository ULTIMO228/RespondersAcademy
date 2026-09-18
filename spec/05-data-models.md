# 05. Модели данных (TypeScript-контракты)

Контракты фронт↔мок-слой. Транспорт — JSON (ТЗ §12). Названия полей: camelCase в коде, русские подписи — в UI-словарях. Все datetime — ISO 8601 локального контура.

Норматив: `hack/Фронт/МОКИ-ДАННЫЕ.md` п. 1.1–1.6 (канонические схемы коллекций `users`, `reference`, `cards`, `scenarios`, `sessions`, `reports`). Поля и сущности сверх норматива помечены **[расширение]** — это решения владельца спек (ТЗ, Q&A). Файлы моков: `spec/mocks/*.json` (см. `spec/mocks/README.md`).

## 1. Пользователи и роли

```ts
type Role = 'student' | 'teacher' | 'admin';

// Норматив п. 1.1 + расширения. Сид: 1 admin, 2–3 teacher, 10–20 student
// (номера АРМ 1..N соответствуют учебному классу).
interface User {
  id: string;                 // "u-001"
  login: string;              // латиница, без пробелов
  password: string;           // [мок-расширение] тестовый пароль, только локальный контур
  fullName: string;           // ФИО (вымышленные)
  role: Role;
  armNumber: number;          // номер рабочего места (на экране карточки «Опер., АРМ 4»); обязательное
  isActive: boolean;          // false = учётная запись заблокирована (вход запрещён)
  group?: string;             // [расширение] учебная группа — для профильных категорий заданий
  service?: string;           // [расширение] служба/организация (ДДС района, Мосводоканал и т.п.)
}

// [расширение мок-слоя] ответ login-endpoint'а (04-pages/00-auth.md)
interface AuthSession {
  userId: string;
  role: Role;
  token: string;              // мок-токен
  twoFactorUsed: boolean;
  issuedAt: string;
}
```

## 2. Справочники (ReferenceData, mocks/reference.json)

```ts
interface ReferenceData {
  ddsStatuses: DdsStatusDef[];        // статусы ДДС — жизненный цикл карточки у диспетчера (норматив п. 2.1)
  serviceStatuses: ServiceStatusDef[]; // статусы служб, таймлайн виджета службы (норматив п. 2.2; бывший responseStatuses)
  callerStatuses: string[];           // 6 статусов заявителя (норматив п. 2.3)
  channels: string[];                 // 9 каналов связи (норматив п. 2.4)
  services: ServiceRef[];             // службы-участники (полный список из заголовков классификатора)
  incidentGroups: string[];           // 105 групп происшествий (значения ClassifierEntry.group)
  classifierRows: ClassifierEntry[];  // $ref: mocks/classifier.json (см. раздел 3) — в reference.json не дублируется, подгружается отдельным файлом

  // Расширения спек (вне норматива п. 1.2):
  cardStatuses: CardStatusDef[];      // [расширение] статусы карточки целиком
  districts: { okrug: string; raions: string[] }[];  // [расширение] округа/районы Москвы (сокращённый набор)
  sources: string[];                  // [расширение] источники: Служба 112, КИС УСС (МЧС), СОДЧ (МВД), КАСУ СМП, Система 104, ЭРА-ГЛОНАСС, ...
  internalNumbers: { number: string; title: string }[]; // [расширение] внутренние номера точки C (3–4 знака),
                                      // включая учебные 101–104 — номера служб для голосового контура B→C (МОКИ-ДАННЫЕ п. 4)
}
```

### 2.1 Статусы ДДС (норматив п. 2.1 МОКИ-ДАННЫЕ)

Полный цикл обязателен. Первичный статус формируется выбором строго из двух — **«Принята» / «Не принята»**; остальные статусы проставляются вручную в ходе реагирования. Форма статуса в UI: поля **«Статус»** (выбор из списка) + **«Номер наряда»** (`dutyNumber`) + **«Комментарий»** (скриншоты ДДС_image8/9; пример из билета ДДС: «Принята», наряд 23, «Отправил сантехник для перекрытия воды»).

```ts
// Граф: старт → accepted | notAccepted;
// accepted → responseStarted → arrived → workInProgress → workDone;
// на любом этапе после accepted доступен workRefused; notAccepted → только accepted.
type DdsStatus =
  | 'accepted'         // Принята (≤ 30 сек от направления!)
  | 'notAccepted'      // Не принята (+ обязательный комментарий)
  | 'responseStarted'  // Начало реагирования (выезд)
  | 'arrived'          // Прибытие
  | 'workInProgress'   // Проведение работ
  | 'workDone'         // Работы завершены (закрывает карточку для редактирования)
  | 'workRefused';     // Отказ от выполнения работ (+ обязательный комментарий)

interface DdsStatusDef {
  status: DdsStatus;
  title: string;
  requiresComment: boolean;   // true для notAccepted и workRefused
  next: DdsStatus[];          // допустимые переходы (граф выше)
}
```

### 2.2 Статусы служб (норматив п. 2.2 МОКИ-ДАННЫЕ)

Таймлайн виджета службы: `Добавлена → Получена службой → Принята → Работы завершены`; вместо «Принята» возможна «Не принята» (причина в комментарии: «вне компетенции», «заявка отклонена»). Нет статуса «Работы завершены» в течение 48 часов → карточка «Не завершено» (см. `CardStatus.unfinished`).

```ts
type ServiceStatus =
  | 'added'        // Добавлена (авто, при сохранении карточки)
  | 'received'     // Получена службой (авто, при открытии на АРМ-112)
  | 'accepted'     // Принята
  | 'notAccepted'  // Не принята (+ обязательный комментарий)
  | 'workDone';    // Работы завершены

interface ServiceStatusDef { status: ServiceStatus; title: string; requiresComment: boolean; next: ServiceStatus[] }
```

### 2.3–2.4 Заявитель и каналы

```ts
// Статусы заявителя (норматив п. 2.3), хранятся в reference.callerStatuses:
type CallerStatus = 'очевидец' | 'пострадавший' | 'родственник' | 'знакомый' | 'ребенок' | 'участник';

// Каналы связи (норматив п. 2.4, 9 значений), хранятся в reference.channels:
// ЕССМ | ЕДЦ | Линия ДСП | МГТС-112 | Мегафон | МТС | Мобильное приложение | МЧС | телефония (АОН)
```

### 2.5 Службы и статусы карточки

```ts
interface ServiceRef {
  id: string;                 // "svc-101", "svc-mosgaz"
  name: string;               // полное название
  shortName: string;          // короткое имя для UI («Служба 101», «МОСГАЗ»)
  kind: 'arm112' | 'vis' | 'phoneOnly';  // phoneOnly показывается светло-серым (памятка, стр. 20)
  classifierName?: string;    // имя службы в заголовках xlsx / ServiceNotification.service (см. раздел 3)
}
// Список services — полный перечень служб из заголовков классификатора (в v.046_24 — 61 уникальное
// имя в notifications). Правило маппинга classifierName: точная строка из classifier.json
// (напр. "МОСГАЗ (Служба 104)", "СМП (Служба 103)", "МВД (Служба 102)"); если classifierName
// не задан — сопоставление с notifications ищется по name/shortName.

// [расширение] Статусы карточки целиком
type CardStatus =
  | 'registered'   // Зарегистрирована
  | 'workedOut'    // Отработана (только карточки Службы 112)
  | 'checked'      // Проверена
  | 'notNotified'  // Не оповещено (служба не проставила Принята/Не принята вовремя) — красная индикация
  | 'refusal'      // Отказ — красная индикация
  | 'unfinished'   // Не завершено (>48ч без «Работы завершены») — красная индикация
  | 'completed';   // Завершена

interface CardStatusDef { status: CardStatus; title: string; alert: boolean }
```

## 3. Классификатор ЕКП (ClassifierEntry, mocks/classifier.json)

Источник: `hack/Фронт/Источники/Классификатор_происшествий_v_046_24_корректировка_МВД_+_Департамент.xlsx` — версия **v.046_24** (1310 строк × 104 колонки), актуальная, заменяет v.046_11. Мета извлечения: **1283 записи** из 1307 строк данных (1310 строк минус 3 строки шапки; отброшены 1 строка без номера и 23 строки-заголовки групп), **105 групп** (в МОКИ-ДАННЫЕ п. 2.5 встречается устаревшее «119 групп» — фактически 105, см. meta classifier.json). Одна запись = комбинация типовых признаков → итоговый тип → оповещение служб.

```ts
interface ClassifierEntry {
  code: string;               // номер (до 8 знаков), напр. "1010101"
  group: string;              // группа происшествий (105 значений), напр. "пожар на улице"
  sign1: string;              // 112-Признак.1, напр. "на улице"
  sign2: string;              // 112-Признак.2, напр. "мусор"
  sign3: string;              // 112-Признак.3, напр. "открытое пламя"
  extraSigns: string;         // Доп. признаки (не влияют на тип), может быть ""
  finalType: string;          // Итоговый тип происшествия, напр. "пожар: мусор"
  ekp35Type: string;          // ТИП происшествия ЕКП 35
  mainService: string;        // Главная служба (колонка 12): MCHS | Police | AMBULANCE | MOSGAZ | ...;
                              // может быть пустым ""; новое значение v.046_24 — 'МСР' (ГУП МСР)
  notifications: ServiceNotification[];  // только непустые ячейки служебных колонок xlsx
}

interface ServiceNotification {
  service: string;            // имя службы из заголовка колонки xlsx (маппинг на ServiceRef.classifierName)
  mode: 'card112' | 'integration' | 'none' | 'mapped';
  // card112      = "карточка-112" (оповещение на АРМ-112; вариант "карточка -112" нормализован)
  // integration  = "интеграция" (уходит в ВИС)
  // none         = "нет реагирования"
  // mapped       = иной текст — маппинг типа для классификатора ВИС (значение хранится в mappedType)
  condition?: string;         // вариант подколонки из заголовка xlsx ("выбран признак Пострадавшие", "газификация", ...)
  mappedType?: string;        // текст маппинга для mode='mapped'
}
```

**Примечание.** Поле `responseScenario` из записей **удалено**: в v.046_24 колонки «Сценарий реагирования» нет (была в v.046_11). Структура строки xlsx: Г/п1/п2/п3 → 112-Признак.1/2/3 (+доп.) → итоговый тип → ТИП ЕКП 35 → главная служба → отображение в каждой службе (у МВД и СМП — по 3 варианта подколонок, у ЦЭМП — 5).

## 4. Учебная карточка (IncidentCard, норматив п. 1.3)

96 учебных карточек из билетов (32 билета × 3 ситуации). Это **входная задача** для курсанта (фабула + эталоны служб/тегов), а не экранная форма ПОВ-112 — экранную форму см. `ArmCardFixture` (раздел 5).

```ts
interface IncidentCard {
  id: string;              // "c-001"…"c-096" (порядок = билет.номер)
  ticketNo: number;        // 1..32 — номер билета
  situationNo: 1 | 2 | 3;  // номер ситуации в билете
  group: string;           // группа происшествия (из классификатора, ReferenceData.incidentGroups)
  summary: string;         // текст ситуации (фабула)
  address: string;         // адрес как в билете (часть — с пометкой «при уточнении…»)
  addressRefined?: string; // уточнённый адрес (если в билете есть)
  caller: { name: string; phone: string; status?: CallerStatus };  // status — из reference.callerStatuses
  victims?: { count: number; note?: string };
  noAmbulance?: boolean;   // пометка «03 не требуется» ([03 не тр.] в билете)
  crossRegion?: boolean;   // вызов из другого региона ([др.регион]) — уточнить/переадресовать
  expectedServices: string[]; // ЭТАЛОН: службы по классификатору (заполняется из матрицы classifierRows)
  expectedTags: string[];  // ЭТАЛОН: теги опросной карты (112-Признак.1/2/3)
  duplicateOf?: string;    // id карточки-оригинала (дубли датасета: 1.2=21.1, 1.3=16.2, ДТП 25.2/26.2/27.2/28.2)
  createdByStudentId?: string; // [расширение] автор-обучающийся — пул карточек для cardSource='studentCreated' (ТЗ §10)
}
```

## 5. Рабочая карточка ПОВ-112 (ArmCardFixture — UI-фикстура)

Богатая модель карточки реального интерфейса ПОВ-112 (памятка стр. 15–26, скриншоты; Q&A в7 — аутентичность полям). Это **не учебная сущность**, а UI-фикстура: живёт в `mocks/fixtures/arm-cards.json`, используется экраном `/arm/card` для аутентичного рендера (телефоны, класс, список оповещения, лента статусов). Пространства id разные: учебные карточки — `c-NNN`, фикстуры — `card-NNNNNN`.

```ts
interface ArmCardFixture {
  id: string;                 // "card-881412"
  number: number;             // числовой номер: «Происшествие 881412» (канон ПОВ-112, см. раздел 10)
  createdAt: string;          // дата/время сохранения
  registeredBy: string;       // "Опер. 14, АРМ 7, Рожкова О.И." / источник ВИС
  source: string;             // "Служба 112" | "СОДЧ (МВД)" | ... (из ReferenceData.sources)
  cardStatus: CardStatus;

  phones: {
    aon: string;              // АОН (определяется автоматически)
    provided: string;         // предоставленный заявителем
    onSite: string;           // телефон «на место»
  };
  smsList?: string[];         // список SMS (если канал СМС)

  applicant: {
    name: string;             // "Иванов"
    status: string;           // из reference.callerStatuses
    birthDate?: string;       // дата рождения заявителя (FIELDS.md §5.4 — календарное поле; §1.1 — формат «гггг-мм-дд»)
  };

  address: {
    formal: string;           // формализованный: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская ул., 58, к. 2, под. 2"
    okrug: string;            // "ЮАО"
    raion: string;            // "Чертаново Южное"
    descriptive: string;      // описательный адрес (свободный текст)
    geo?: { lat: number; lon: number; accuracy?: number };  // accuracy — точность координат, радиус круга на карте, м
                                                            // (FIELDS.md §1.1; ненулевое даёт только оператор связи)
  };

  what: {
    pollAnswers: string;      // опросная карта (неформализованная выжимка), напр. "На чердаке мужчина с большой сумкой..."
    signs: string[];          // выбранные типовые признаки (путь по дереву)
    finalType: string;        // итоговый тип, напр. "Аварии и происшествия в городском хозяйстве / Дерево. Двор (упало)"
    klass: string;            // "Класс:" после опросной карты, напр. "Дерево упало во дворе"
    visKlass?: string;        // "[ВИС] Класс:" для карточек из ВИС
    casualties: { injured: boolean; ambulanceRefused: boolean; blocked: boolean }; // "Пострадавшие / Отказ от скорой / Заблокированные"
    classifierCode?: string;  // связь с ClassifierEntry.code (если тип из ЕКП)
  };

  description: string;        // "Описание" — неформализованная информация, история карточки
  workLines: WorkLine[];      // "Строки отработки" — звонки специалистов 112
  notificationList: NotificationEntry[]; // список оповещения

  emergency: { chs: boolean; chp: boolean };  // отметки ЧС/ЧП
  createdByVis: boolean;      // карточка создана ВИС (меньше полей, памятка стр. 14)
}

interface WorkLine {
  operator: string; at: string; service: string; calledTo: string; person: string; message: string;
}

interface NotificationEntry {
  serviceId: string;          // → ServiceRef
  addedBy: 'auto' | 'manual' | 'vis';  // авто по ЕКП / вручную специалистом / добавилась из ВИС (метка «ВИС»)
  statuses: ServiceStatusEvent[];      // история статусов службы (хронология)
}

interface ServiceStatusEvent {
  status: ServiceStatus;      // таймлайн службы (ReferenceData.serviceStatuses)
  at: string;                 // метка времени
  actor: string;              // "оп. 14" / ФИО / "оп. 9999" (у ВИС всегда оп. 9999)
  comment?: string;           // обязателен для notAccepted (памятка стр. 26)
}
```

## 6. Учебные сценарии и эталоны (Scenario)

```ts
type ScenarioLevel = 'beginner' | 'advanced';  // норматив п. 1.4: шаблон / генеративная вариация (Q&A в3)
type Difficulty = 1 | 2 | 3 | 4 | 5;           // [расширение] гранулярная сложность (ТЗ §5, адаптивность Q&A в10)
// Маппинг: beginner ↔ difficulty 1–2, advanced ↔ difficulty 3–5.

interface Scenario {
  id: string;                 // "s-001"
  title: string;              // напр. "Пожар-квартира. Базовый"
  level: ScenarioLevel;
  sourceTicketNo: number;     // 1..32 — билет-источник (обезличенные билеты заказчика, Q&A в13)
  cardIds: string[];          // очередь карточек (1–3+, многозадачность Q&A в6) → IncidentCard.id
  timeNorms: { primaryReactionSec: number; fullProcessingSec: number }; // нормативы заказчика: 30 сек / 180 сек
  hints: { enabled: boolean; texts: string[] };  // подсказки для новичков (Q&A в4); enabled=false → texts не показываются
  callTarget?: string;        // внутренний 3–4-значный номер главной службы для голосового контура B→C (учебные 101–104)

  // Расширения спек:
  difficulty: Difficulty;     // [расширение] гранулярная сложность (маппинг к level — выше)
  etalon: Etalon;             // [расширение] эталонные ответы/действия
  validation: {               // [расширение] workflow согласования преподавателем
    status: 'draft' | 'pending' | 'approved' | 'rejected';
    reviewedBy?: string;      // userId преподавателя
    comment?: string;         // корректирующий комментарий преподавателя (ТЗ §10)
  };
  successCriteria: {          // [расширение] критерии успешности (ТЗ §8)
    maxGrammarErrors: number;
    requiredFields: string[];
    syntaxRequirements: string;
  };
  source: 'template' | 'generated';   // [расширение] шаблон / генерация ИИ (Q&A в3)
}

interface Etalon {
  expectedFields?: Record<string, string>;  // эталонные значения полей карточки (может отсутствовать)
  expectedActions: string[];               // ожидаемая последовательность действий (статусы ДДС, звонок точке C)
  expectedText?: string;                   // эталонная формулировка (смысловое, не посимвольное сравнение — Q&A в5)
  keyPhrases: string[];                    // ключевые смысловые маркеры
}
```

## 7. Занятие (Session) и события карточек (CardEvent)

> **Примечание (расхождение с МОКИ-ДАННЫЕ п. 1.5).** Норматив описывает per-student Session
> (один `studentId`, один `scenarioId`, плоский список `cardEvents`). Решение владельца спек:
> **канон — групповое занятие по ТЗ §10** (`studentIds[]`, `scenarioIds[]`, `cardFlow`, `state`).
> Нормативная per-student Session отдельно не хранится — это **проекция** канонической Session:
> `cardEvents`, отфильтрованные по `studentId` (плюс его строки `cardFlow`). Мок `sessions.json`
> хранит групповую форму; per-student представление строится на лету для отчётов и мониторинга.

```ts
type SessionState = 'draft' | 'configured' | 'running' | 'finished' | 'reported';
type ScenarioMode = 'demo' | 'follow' | 'practice';  // показ / делай как я / самостоятельная (Q&A в9)

interface Session {
  id: string;
  teacherId: string;
  studentIds: string[];       // группа курсантов
  scenarioIds: string[];
  mode: ScenarioMode;
  cardSource: 'generated' | 'studentCreated' | 'mixed';  // ТЗ §10; пул studentCreated — карточки с IncidentCard.createdByStudentId
  cardFlow: CardFlowItem[];   // расписание выдачи карточек (многозадачность, Q&A в6)
  state: SessionState;
  startedAt: string;          // ISO datetime
  finishedAt?: string;
  cardEvents: CardEvent[];    // хронология действий всех курсантов (норматив п. 1.5)
}

interface CardFlowItem {
  cardId: string;
  studentId: string;
  issuedAt: string;           // когда карточка «падает» в очередь курсанта
  level: ScenarioLevel;       // уровень выданной карточки (адаптивная сложность, Q&A в10)
}

// Отработка одной карточки одним курсантом (норматив п. 1.5 + расширения; бывший Attempt).
interface CardEvent {
  cardId: string;
  studentId: string;
  openedAt: string;           // момент открытия карточки
  primaryReactionMs: number;  // факт против норматива 30 сек
  statuses: {                 // статусы ДДС, проставленные курсантом (форма: Статус + Номер наряда + Комментарий)
    ddsStatus: DdsStatus;
    at: string;
    comment?: string;         // обязателен для notAccepted / workRefused
    dutyNumber?: string;      // номер наряда
  }[];
  servicesCalled: string[];   // каким службам звонил диспетчер (контур B→C, номера из reference.internalNumbers)
  completedAt: string;
  fullProcessingMs: number;   // факт против норматива 3 мин

  // Расширения спек:
  enteredText: Record<string, string>;  // [расширение] ручной ввод курсанта по полям
  calls: PhoneCall[];                   // [расширение] вызовы точке C (транскрипты)
  evaluation?: Evaluation;              // [расширение] оценка (ИИ + правка преподавателя)
}

interface Evaluation {
  timeScore: number;          // 0..100 — соблюдение нормативов
  correctnessScore: number;   // 0..100 — корректность заполнения
  grammarScore: number;       // 0..100 — грамматика/орфография ручного ввода
  semanticScore: number;      // 0..100 — смысловая точность
  totalScore: number;         // интегральный балл (веса настраивает преподаватель)
  grammarErrors: {
    field: string;
    fragment: string;         // фрагмент текста с ошибкой
    wrong: string;
    expected: string;
    type: 'spelling' | 'syntax';
  }[];
  errors: { type: string; severity: 'critical' | 'major' | 'minor'; message: string }[]; // зафиксированные ошибки
  aiComment: string;          // разбор от ИИ (мок, бейдж «ИИ»)
  teacherOverride?: { score: number; comment: string; at: string; by: string }; // приоритет преподавателя (Q&A в3), пишется в аудит (ТЗ §8)
}

interface PhoneCall {
  id: string;
  fromUserId: string;
  toNumber: string;           // внутренний номер точки C (3–4 знака; учебные 101–104)
  startedAt: string;
  endedAt?: string;
  transcript: { speaker: 'dispatcher' | 'ai'; text: string; at: string }[]; // лог диалога (мок)
}
```

## 8. Отчёты (Report / GroupReport, Q&A в16, ТЗ §10)

```ts
// Персональный отчёт по курсанту (норматив п. 1.6, состав задан заказчиком) + расширения.
interface Report {
  id: string;
  sessionId: string;
  student: { fullName: string; armNumber: number };  // денормализация для печатной формы
  timeMetrics: { stage: string; normMs: number; factMs: number; deviationMs: number }[]; // этапы: первичная реакция, полная обработка
  grammarErrors: { cardId: string; field: string; fragment: string; type: 'spelling' | 'syntax' }[];
  errors: { cardId: string; type: string; severity: 'critical' | 'major' | 'minor'; message: string }[];
  score: number;              // интегральный балл (веса определяет команда, Q&A в5)
  charts: { byStage: unknown; byErrorType: unknown; dynamics: unknown };  // данные для графиков/диаграмм
  aiComment?: string;         // [расширение] общий разбор ИИ (мок, бейдж «ИИ»)
}

// [расширение] Групповой отчёт по занятию (экран преподавателя; бывший SessionReport).
interface GroupReport {
  id: string;
  sessionId: string;
  generatedAt: string;
  reportIds: string[];        // персональные Report.id курсантов группы
  groupInsights: string[];    // инсайты ИИ по типичным ошибкам группы (мок)
  charts: ChartData[];        // данные для графиков/диаграмм
}

interface ChartData { kind: 'bar' | 'line' | 'heatmap' | 'table'; title: string; series: unknown }
```

## 9. Администрирование

```ts
interface SystemService { id: string; name: string; state: 'running' | 'stopped' | 'degraded'; uptimeSec: number }
interface AuditLogEntry { id: string; at: string; userId: string; role: Role; action: string; details: string; ip?: string }
interface SystemSettings {
  telephony: { sipServer: string; realm: string; enabled: boolean };
  database: { host: string; name: string };
  backup: { periodHours: number; lastAt: string };  // не реже 1 раза в сутки (ТЗ §9)
  logging: { level: string; retentionMonths: number }; // журналы ≥ 6 мес (ТЗ §9)
}
```

## 10. Сверка с FIELDS.md

Словарь полей реальных АРМ — `research/arm-112/docs/FIELDS.md`. Решения по переносу в модель:

**Взято в модель:**

- `ArmCardFixture.applicant.birthDate` — дата рождения заявителя (iskratechno-2024 стр. 24; protei-2024 стр. 40, календарное поле);
- `ArmCardFixture.address.geo.accuracy` — точность координат, радиус круга на карте (iskratechno-2024 стр. 26–27; при ручном изменении координат сбрасывается в 0 — логика UI, не мока).

**Out-of-scope (в тренажёр не берём):**

- специфические части ДДС (панель «Данные ДДС», FIELDS.md §2.5) — состав полей в дампах не приведён;
- путевой лист бригады (FIELDS.md §2.6 — генерация и печать);
- вкладка «ГЛОНАСС» карточек ЭРА-ГЛОНАСС (protei-2024, FIELDS.md §5.5);
- «История УКИО» как журнал изменений с IP-адресами операторов (FIELDS.md §4);
- авто-установка уровня серьёзности по числу пострадавших/погибших (FIELDS.md §2.2; отметки ЧС/ЧП в моке — ручные, `ArmCardFixture.emergency`).

**Идентификаторы карточек.** Канон — числовой номер московского ПОВ-112: «Происшествие 881412» (`ArmCardFixture.number: number`). Составные идентификаторы вида `май26_ДТП_008` (вендор Искра, iskratechno/iskrauraltel) **не использовать**.

## Приложение. Соответствие прежних и новых имён (волна B)

| Было | Стало |
|---|---|
| `User.blocked`, `User.createdAt` | `User.isActive` (инверсия `blocked`); `createdAt` удалено |
| `ReferenceData.responseStatuses`, `ResponseStatus(Def/Event)` | разделены: `ddsStatuses`/`DdsStatus(Def)` (форма ДДС) и `serviceStatuses`/`ServiceStatus(Def/Event)` (таймлайн службы) |
| `ClassifierEntry.responseScenario` | удалено (в v.046_24 колонки нет) |
| `IncidentCard` (богатая UI-модель, 12 шт. в `cards.json`) | `ArmCardFixture` → `mocks/fixtures/arm-cards.json`; имя `IncidentCard` теперь за учебной карточкой (норматив п. 1.3, 96 шт.) |
| `Attempt` | `CardEvent` (`statusEvents` → `statuses[].ddsStatus/dutyNumber`; `mistakes: string[]` → `errors[]`; добавлены `primaryReactionMs`, `fullProcessingMs`) |
| `SessionReport` | `Report` (персональный, норматив п. 1.6) + `GroupReport` [расширение] |
| `Scenario.sourceTicketId`, `timing`, `hints: string[]`, `categories`, `classifierCodes` | `sourceTicketNo` (1..32), `timeNorms`, `hints: {enabled, texts[]}`; `categories`/`classifierCodes` удалены (группа и тип — через карточки сценария) |
