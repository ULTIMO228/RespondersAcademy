"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CARD_TIMER_RED_SEC,
  canEdit,
  cardTimer,
  examRemainingSec,
  formatAon,
  formatClock,
  resolveTimeLimitSec,
} from "@/entities/operator112-attempt";
import type { ApplicantVoice, HintProgress } from "@/entities/operator112-attempt";
import { LinksView, MatchWindow } from "@/features/card-links";
import type { LinkedCard } from "@/features/card-links";
import { Operator112AddressField } from "@/features/operator112/address";
import { TypeTabs, useTypeTabs } from "@/features/operator112/type-tabs";
import type { FirstTabValue, TypeTabsApi } from "@/features/operator112/type-tabs";
import { ServicesPanel } from "@/features/operator112/services";
import { Operator112Card, ReminderWindow, SmsHistory, useCardReminder } from "@/widgets/operator112-card";
import type { CardFlag112, SmsMessage } from "@/widgets/operator112-card";
import type {
  AssignmentDetail,
  CardChannel,
  CardDraft,
  CardDraftAddress,
  ClassifierEntry,
  Journal112Row,
  NotificationListItem,
  OperatorAttempt,
  OperatorEvent,
  OperatorEventRequest,
} from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import type { Operator112Api } from "../api/operator112Api";
import { applyLinkEvent, emptyAddress, FIELD, restoreForm, toCardDraft } from "../model/draft";
import type { DraftForm, FormErrors } from "../model/draft";
import { useFieldEvents } from "../model/useFieldEvents";
import { useHotkeys } from "../model/useHotkeys";
import { ConfirmDialog } from "./ConfirmDialog";

import styles from "./Operator112CardView.module.css";

export type CardViewKind = "card" | "links" | "smsHistory";

type Operator112CardViewProps = {
  assignment: AssignmentDetail;
  /** Попытка выданного вызова; null — карточка-тренировка «создать новую карточку» (без телефонии, вне оценки). */
  attempt: OperatorAttempt | null;
  entries: ClassifierEntry[];
  api: Operator112Api;
  clock?: Clock;
  nowMs: number;
  /** Карточка на экране. Иначе она остаётся смонтированной скрыто, чтобы журнал не сбрасывал черновик. */
  active: boolean;
  view: CardViewKind;
  operatorLine: string;
  channel: CardChannel;
  smsText: string;
  journalRows: Journal112Row[];
  voice: ApplicantVoice | null;
  isSubmitting: boolean;
  errors: FormErrors;
  onOpenLinks: () => void;
  onOpenSmsHistory: () => void;
  onBackToCard: () => void;
  /** «сохранить» подтверждено: передать карточку (examZero — остаток лимита экзамена равен нулю). */
  onSubmit: (draft: CardDraft, examZero: boolean) => void;
  /** «закрыть» в «Закрыть карточку без сохранения?» — вернуться в журнал. */
  onClose: () => void;
  /** Прогресс заполнения для подсказок «делай как я»; любое изменение формы — действие обучающегося. */
  onProgress: (progress: HintProgress) => void;
  onNotice: (message: string | null) => void;
  /** События связей и т. п. меняют журнал: экран перечитывает его. */
  onJournalChanged: () => void;
  onProblem?: () => void;
};

type Dialog = null | "notify" | "close" | "reminder";

type ListState = {
  services: NotificationListItem[];
  conditional: NotificationListItem[];
  status: "idle" | "loading" | "error";
  error: string;
};

const NO_LIST: ListState = { services: [], conditional: [], status: "idle", error: "" };
const NO_EVENT = {} as OperatorEvent;
const ADDRESS_KEYS = [
  "street",
  "house",
  "okrug",
  "raion",
  "descriptive",
  "country",
  "subject",
  "locality",
  "object",
  "korpus",
  "building",
  "flat",
  "entrance",
  "floor",
  "code",
  "lat",
  "lon",
] as const;
const DEFAULT_REMINDER_MIN = "5";

/** Область карточки, куда уходит фокус по сочетаниям Alt+A / Alt+T. */
function focusFirst(root: HTMLElement | null, selector: string) {
  root?.querySelector<HTMLElement>(selector)?.focus();
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Карточка ПОВ-112 с поведением: черновик, события попытки, вкладки типов, список оповещения, связи, напоминание,
 * подтверждения «сохранить» и «×». Состояние карточки живёт здесь и не теряется при переходе в «связи», «историю
 * сообщений», напоминание или журнал (компонент остаётся смонтированным, скрывается через `active`).
 */
export function Operator112CardView({
  assignment,
  attempt,
  entries,
  api,
  clock,
  nowMs,
  active,
  view,
  operatorLine,
  channel,
  smsText,
  journalRows,
  voice,
  isSubmitting,
  errors,
  onOpenLinks,
  onOpenSmsHistory,
  onBackToCard,
  onSubmit,
  onClose,
  onProgress,
  onNotice,
  onJournalChanged,
  onProblem,
}: Operator112CardViewProps) {
  const isPractice = attempt === null;
  const limitSec = resolveTimeLimitSec(assignment.params);
  const isExam = assignment.format === "exam";
  const [form, setForm] = useState<DraftForm>(() =>
    attempt ? restoreForm(attempt.events, channel) : { ...restoreForm([], channel), address: emptyAddress() },
  );
  const [list, setList] = useState<ListState>(NO_LIST);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [matches, setMatches] = useState<Journal112Row[]>([]);
  const [smsSeen, setSmsSeen] = useState(false);
  const [reminderShown, setReminderShown] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(DEFAULT_REMINDER_MIN);
  const [reminderText, setReminderText] = useState("");
  const practiceStart = useRef(nowMs);
  const root = useRef<HTMLDivElement>(null);
  const listSeq = useRef(0);
  const player = useRef<HTMLAudioElement>(null);
  const reminder = useCardReminder(clock);

  const editable = (isPractice || (attempt !== null && canEdit(attempt))) && !isSubmitting;
  const attemptId = attempt?.id ?? "";
  const aon = attempt?.aon ?? "";

  // Практика и «нет попытки» ничего не отправляют на сервер.
  const send = useCallback(
    (event: OperatorEventRequest): Promise<unknown> =>
      attempt ? api.sendEvent(attempt.id, event) : Promise.resolve(NO_EVENT),
    [api, attempt],
  );
  const events = useFieldEvents(send, onNotice);

  const patch = useCallback(
    (changes: Partial<DraftForm>) => setForm((current) => ({ ...current, ...changes })),
    [],
  );

  /** Пересчёт списка оповещения на сервере (фронт ЕКП не воспроизводит). */
  const refreshList = useCallback(async () => {
    if (!attempt) return;
    const id = ++listSeq.current;
    setList((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const response = await api.getNotificationList(attempt.id);
      if (id !== listSeq.current) return;
      setList({ services: response.services, conditional: response.conditional, status: "idle", error: "" });
      setForm((current) => ({ ...current, notifications: response.services }));
    } catch (error) {
      if (id !== listSeq.current) return;
      setList((current) => ({
        ...current,
        status: "error",
        error: toMessage(error, "Не удалось получить список оповещения"),
      }));
    }
  }, [api, attempt]);

  const tabsApi = useMemo<TypeTabsApi>(
    () => ({ sendEvent: (_id, event) => send(event) as Promise<OperatorEvent> }),
    [send],
  );
  const onFirstTabChange = useCallback(
    (value: FirstTabValue) => {
      patch({ signs: value.signs, finalType: value.finalType, classifierCode: value.classifierCode });
      if (value.signs.length === 0) {
        setList(NO_LIST);
        patch({ notifications: [] });
      } else {
        void refreshList();
      }
    },
    [patch, refreshList],
  );
  const tabs = useTypeTabs({
    attemptId,
    entries,
    initialSigns: form.signs,
    disabled: !editable,
    casualties: { injured: form.injured, ambulanceRefused: form.ambulanceRefused, blocked: form.blocked },
    api: tabsApi,
    onFirstTabChange,
  });

  // Карточки журнала с тем же заявителем: окно «Есть карточка…» после «Принять» (один раз на попытку).
  useEffect(() => {
    if (!attempt || form.links.length > 0) return;
    let cancelled = false;
    api.matches(attempt.id).then(
      (response) => {
        if (!cancelled) setMatches(response.matches);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // Запрос — один раз при монтировании карточки попытки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attemptId]);

  // Запись заявителя: проигрывается сама, как только готова; «записи звонков» запускают её заново.
  const recordingUrl = voice?.recordingUrl ?? null;
  useEffect(() => {
    if (!recordingUrl || !player.current) return;
    const started = player.current.play();
    if (started && typeof started.catch === "function") started.catch(() => undefined);
  }, [recordingUrl]);

  useEffect(() => {
    if (reminder.isDue) setReminderShown(true);
  }, [reminder.isDue]);

  // Подсказки: любое изменение формы — действие; прогресс по заполненным блокам.
  const formKey = JSON.stringify([form, tabs.tabs.length]);
  useEffect(() => {
    onProgress({
      answered: !isPractice,
      applicant: Boolean(form.applicantName.trim()),
      address: Boolean(form.address.street.trim() || form.address.descriptive.trim()),
      description: Boolean(form.description.trim()),
      poll: form.signs.length > 0,
      signs: form.signs.length > 0,
      notification: form.notifications.length > 0,
    });
    // formKey — снимок всех зависимостей выше.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);

  const text =
    (
      key: "applicantName" | "applicantStatus" | "phoneProvided" | "phoneOnSite" | "description",
      field: string,
    ) =>
    (value: string) => {
      patch({ [key]: value });
      events.queue(field, value);
    };

  const changeAddress = (next: CardDraftAddress) => {
    const previous = form.address;
    patch({ address: next });
    for (const key of ADDRESS_KEYS) {
      if (previous[key] !== next[key]) events.queue(FIELD[key], next[key]);
    }
    if (previous.source !== next.source) events.queue(FIELD.addressSource, next.source);
  };

  /** Флаги уходят событием сразу: от них зависят условные службы оповещения. */
  const onFlag = (flag: CardFlag112, value: boolean) => {
    patch({ [flag]: value });
    send({ type: "fieldChanged", payload: { field: FIELD[flag], value } }).then(
      () => {
        if (flag !== "ambulanceRefused") void refreshList();
      },
      (error: unknown) => onNotice(toMessage(error, "Не удалось сохранить флаг")),
    );
  };

  const draftOf = (changes: Partial<DraftForm> = {}, notificationConfirmed = false) =>
    toCardDraft(
      {
        ...form,
        ...changes,
        extraIncidents: tabs.incidents.slice(1).map((what) => ({ what, notifications: [] })),
      },
      aon,
      notificationConfirmed,
    );

  const examZero = attempt ? examRemainingSec(attempt, limitSec, nowMs) === 0 : false;

  /** notificationConfirmed — сохранение после «оповестить» (фича 007); исходы «нет контакта» / «срыв» идут без него. */
  const submitNow = (changes: Partial<DraftForm> = {}, notificationConfirmed = false) => {
    events.flush();
    onSubmit(draftOf(changes, notificationConfirmed), examZero);
  };

  /** «нет контакта» / «срыв звонка»: карточка сохраняется пустой с исходом (007, FR-017). */
  const finishWithOutcome = (outcome: "noContact" | "dropped") => {
    if (isPractice) {
      setDialog("close");
      return;
    }
    patch({ outcome });
    void send({ type: "fieldChanged", payload: { field: FIELD.outcome, value: outcome } }).catch(
      () => undefined,
    );
    submitNow({ outcome });
  };

  const askSave = () => {
    if (isSubmitting) return;
    setDialog(isPractice ? "close" : "notify");
  };

  const removeService = (serviceId: string) => {
    send({ type: "serviceRemoved", payload: { serviceId } }).then(
      () => void refreshList(),
      (error: unknown) => onNotice(toMessage(error, "Не удалось убрать службу")),
    );
  };

  const addServices = (serviceIds: string[]) => {
    void (async () => {
      try {
        for (const serviceId of serviceIds) await send({ type: "serviceAdded", payload: { serviceId } });
      } catch (error) {
        onNotice(toMessage(error, "Не удалось добавить службу"));
      }
      void refreshList();
    })();
  };

  // Связи карточек: события шлёт экран, главная — ровно одна (draft.applyLinkEvent).
  const linkEvent = (type: "linkAdded" | "linkRemoved" | "linkPrimary", cardId: string) => {
    patch({ links: applyLinkEvent(form.links, type, cardId) });
    send({ type, payload: { cardId } }).then(
      () => onJournalChanged(),
      (error: unknown) => onNotice(toMessage(error, "Не удалось изменить связь")),
    );
  };

  const linkedCards: LinkedCard[] = form.links.flatMap((link) => {
    const row = journalRows.find((item) => item.cardId === link.cardId);
    return row ? [{ row, primary: link.primary }] : [];
  });

  // Текущая (заполняемая) карточка в «Показ связей» — подчинённая строка (ИНСТРУКЦИЯ_65).
  const currentRow: Journal112Row = {
    cardId: attempt?.cardId ?? "practice",
    number: attempt ? String(attempt.incidentNumber) : "",
    createdAt: attempt?.openedAt ?? new Date(nowMs).toISOString(),
    operator: operatorLine.replace(/^Опер\.\s*/, "").split(",")[0] ?? "",
    arm: /АРМ (\d+)/.exec(operatorLine)?.[1] ?? "",
    whatHappened: tabs.incidents[0]?.finalType ?? "",
    injured: form.injured ? "Да" : "Нет",
    status: "",
    address: form.address.formal,
    description: form.description,
    linked: form.links.length > 0,
    chs: false,
    checked: false,
    isOwn: true,
  };

  const replay = () => {
    if (isExam || !attempt) return;
    void send({ type: "replay" }).catch(() => undefined);
    if (player.current) {
      player.current.currentTime = 0;
      player.current.play().catch(() => undefined);
    }
  };

  const smsMessages: SmsMessage[] =
    attempt && channel === "sms" && smsText
      ? [
          {
            id: `sms-${attempt.id}`,
            operator: "",
            dateTime: formatDateTime(attempt.openedAt),
            status: "получено",
            phone: formatAon(attempt.aon),
            text: smsText,
          },
        ]
      : [];
  const smsUnread = smsSeen ? 0 : smsMessages.length;

  const timerState = attempt ? cardTimer(attempt, nowMs) : null;
  const practiceSec = Math.max(0, Math.floor((nowMs - practiceStart.current) / 1000));
  const timer = timerState ?? {
    text: formatClock(practiceSec),
    isRed: practiceSec >= CARD_TIMER_RED_SEC,
  };

  const sendReminder = () => {
    const minutes = Number.parseInt(reminderMinutes, 10);
    if (reminder.set(minutes, reminderText)) {
      setDialog(null);
      setReminderText("");
      setReminderMinutes(DEFAULT_REMINDER_MIN);
    }
  };

  // Сочетания карточки — по таблице «Горячие клавиши карточки» памятки АРМ-112 (ФРОНТ-АРМ-112-ЕДИНЫЙ-ДОКУМЕНТ §3.17).
  const focusPhone = (index: number) => () =>
    root.current?.querySelectorAll<HTMLElement>('[data-block="phones"] input')[index]?.focus();
  useHotkeys(
    {
      "Alt+F1": focusPhone(0),
      "Alt+F2": focusPhone(1),
      "Alt+F3": focusPhone(2),
      "Alt+KeyQ": () => focusFirst(root.current, '[aria-label="Фамилия и имя заявителя"]'),
      "Alt+KeyA": () => focusFirst(root.current, '[aria-label="Адрес"] input'),
      "Alt+KeyP": () => focusFirst(root.current, '[data-block="casualties"] button'),
      "Alt+KeyN": () => focusFirst(root.current, '[data-block="noContact"] button:not(:disabled)'),
      "Alt+KeyT": () => focusFirst(root.current, '[aria-label="Тип происшествия"] input'),
      "Alt+KeyO": () => focusFirst(root.current, '[data-block="description"] textarea'),
      "Alt+KeyZ": () => focusFirst(root.current, '[aria-label="Службы"] button:not(:disabled)'),
      "Alt+KeyS": askSave,
      "Alt+KeyW": () => (form.links.length > 0 ? onOpenLinks() : undefined),
      "Alt+KeyB": () => setDialog("reminder"),
      "Alt+KeyM": () => onProblem?.(),
      // Esc: из «Показ связей» и «Истории сообщений» — назад в карточку, в карточке — вопрос о закрытии.
      Escape: () => (view === "card" ? setDialog("close") : onBackToCard()),
    },
    active && dialog === null,
  );

  const closeLabel = "Закрыть карточку без сохранения?";
  const serviceTitles = list.services.map((item) => item.title);

  const card = (
    <div ref={root} hidden={!active} className={styles.view}>
      <Operator112Card
        phone={{
          // Во время разговора линия занята — подпись трубки «Отключение» (КАРТОЧКА_1).
          status: isPractice ? "не подключен" : attempt?.state === "answered" ? "Отключение" : "доступен",
          aon: attempt ? formatAon(attempt.aon) : "",
          phoneProvided: form.phoneProvided,
          phoneOnSite: form.phoneOnSite,
          onPhoneProvided: text("phoneProvided", FIELD.phoneProvided),
          onPhoneOnSite: text("phoneOnSite", FIELD.phoneOnSite),
          onRecordings: isPractice || channel === "sms" ? undefined : replay,
          isRecordingsDisabled: isPractice || channel === "sms" || isExam,
          onSmsList: () => {
            setSmsSeen(true);
            onOpenSmsHistory();
          },
          smsUnread,
          disabled: !editable,
        }}
        header={{
          number: attempt ? attempt.incidentNumber : "новая",
          savedAt: attempt?.answeredAt ? formatDateTime(attempt.answeredAt) : "",
          operatorLine,
        }}
        timer={timer}
        applicant={{
          name: form.applicantName,
          status: form.applicantStatus,
          onName: text("applicantName", FIELD.applicantName),
          onStatus: text("applicantStatus", FIELD.applicantStatus),
          disabled: !editable,
        }}
        description={{
          value: form.description,
          onChange: text("description", FIELD.description),
          disabled: !editable,
        }}
        address={
          <Operator112AddressField
            value={form.address}
            onChange={changeAddress}
            disabled={!editable}
            error={errors.address}
          />
        }
        flags={{ injured: form.injured, ambulanceRefused: form.ambulanceRefused, blocked: form.blocked }}
        onFlag={onFlag}
        onNoContact={() => finishWithOutcome("noContact")}
        onDropped={() => finishWithOutcome("dropped")}
        isTypeChosen={tabs.tabs.length > 0}
        disabled={!editable}
        typeTabs={
          <>
            {errors.description || errors.general ? (
              <p className={styles.view__error} role="alert">
                {errors.description ?? errors.general}
              </p>
            ) : null}
            <TypeTabs state={tabs} entries={entries} disabled={!editable} />
          </>
        }
        servicesBar={
          <ServicesPanel
            services={list.services}
            conditional={list.conditional}
            status={list.status}
            errorMessage={list.error}
            onRetry={() => void refreshList()}
            disabled={!editable}
            isSaving={isSubmitting}
            onRemove={removeService}
            onAddServices={addServices}
            onSave={askSave}
            onLinks={form.links.length > 0 ? onOpenLinks : undefined}
            isLinked={form.links.length > 0}
            onReminder={() => setDialog("reminder")}
            onProblem={onProblem}
            onClose={() => setDialog("close")}
          />
        }
        overlays={
          <>
            {view === "smsHistory" ? (
              <SmsHistory messages={smsMessages} unread={smsUnread} onBack={onBackToCard} />
            ) : null}
            {active && matches.length > 0 ? (
              <MatchWindow
                matches={matches}
                onLink={(cardId) => {
                  linkEvent("linkAdded", cardId);
                  setMatches([]);
                }}
                onContinue={() => setMatches([])}
              />
            ) : null}
            {active && dialog === "notify" ? (
              <ConfirmDialog
                title="Подтвердите оповещение служб"
                confirmLabel="оповестить"
                onConfirm={() => {
                  setDialog(null);
                  submitNow({}, true);
                }}
                onCancel={() => setDialog(null)}
              >
                {serviceTitles.length > 0 ? (
                  <ul className={styles.view__services}>
                    {serviceTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Список оповещения пуст.</p>
                )}
              </ConfirmDialog>
            ) : null}
            {active && dialog === "close" ? (
              <ConfirmDialog
                title={closeLabel}
                confirmLabel="закрыть"
                onConfirm={() => {
                  setDialog(null);
                  events.flush();
                  onClose();
                }}
                onCancel={() => setDialog(null)}
              />
            ) : null}
            {active && dialog === "reminder" ? (
              <ConfirmDialog
                title="Напоминание"
                confirmLabel="поставить"
                confirmDisabled={!reminderText.trim()}
                onConfirm={sendReminder}
                onCancel={() => setDialog(null)}
              >
                <label className={styles.view__field}>
                  Что сделать
                  <input
                    className={styles.view__input}
                    value={reminderText}
                    onChange={(event) => setReminderText(event.target.value)}
                  />
                </label>
                <label className={styles.view__field}>
                  Через сколько минут
                  <input
                    className={styles.view__input}
                    inputMode="numeric"
                    value={reminderMinutes}
                    onChange={(event) => setReminderMinutes(event.target.value.replace(/\D/g, ""))}
                  />
                </label>
              </ConfirmDialog>
            ) : null}
          </>
        }
      />
    </div>
  );

  return (
    <>
      {card}
      {active && view === "links" ? (
        <LinksView
          cards={linkedCards}
          current={{
            row: currentRow,
            onUnlink: () => form.links.forEach((link) => linkEvent("linkRemoved", link.cardId)),
          }}
          onUnlink={(cardId) => linkEvent("linkRemoved", cardId)}
          onMakePrimary={(cardId) => linkEvent("linkPrimary", cardId)}
          onBack={onBackToCard}
        />
      ) : null}
      {recordingUrl ? <audio ref={player} src={recordingUrl} preload="auto" hidden /> : null}
      {reminderShown && reminder.reminder ? (
        <ReminderWindow
          cardNumber={attempt ? attempt.incidentNumber : "новая"}
          dateTime={formatDateTime(new Date(reminder.reminder.dueAtMs).toISOString())}
          address={form.address.formal}
          note={reminder.reminder.text}
          onGoToCard={() => {
            setReminderShown(false);
            onBackToCard();
          }}
          onSnooze={(minutes) => {
            reminder.snooze(minutes);
            setReminderShown(false);
          }}
          onDelete={() => {
            reminder.remove();
            setReminderShown(false);
          }}
          onClose={() => setReminderShown(false)}
        />
      ) : null}
    </>
  );
}
