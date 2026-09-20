import { getCallDurationMs } from "@/features/call-control";
import type { CallLogEntry, CallTarget } from "@/features/call-control";
import { formatDuration } from "@/shared/lib";
import { Button } from "@/shared/ui";

import { RECENT_CALLS_LIMIT } from "../config/phoneTabs";

import styles from "./PhonePage.module.css";

type PhoneTabStubProps = {
  kind: "calls" | "sms";
  activeCall: CallTarget | null;
  journal: CallLogEntry[];
};

/** Вкладка «SMS» — честная чат-заглушка: переписка по АОН ведётся в карточке («список SMS»). */
function SmsStub() {
  return (
    <div className={styles.stub}>
      <p className={styles.stub__note}>
        Учебная заглушка: SMS из софтфона в учебном контуре не отправляются.
      </p>
      <div className={styles.stub__chat} role="log" aria-label="SMS-чат (заглушка)">
        <p className={styles.stub__text}>Сообщений нет.</p>
      </div>
      <div className={styles.stub__compose}>
        <input
          className={styles.stub__input}
          aria-label="Текст SMS (недоступно)"
          placeholder="Отправка недоступна"
          disabled
        />
        <Button size="sm" disabled title="Недоступно в учебном контуре">
          Отправить
        </Button>
      </div>
      <p className={styles.stub__note}>Переписка по АОН — в карточке происшествия («список SMS»).</p>
    </div>
  );
}

/** Вкладки «Звонки» (текущий вызов + последние из журнала) и «SMS» (заглушка) панели АРМ ЕДДС. */
export function PhoneTabStub({ kind, activeCall, journal }: PhoneTabStubProps) {
  if (kind === "sms") return <SmsStub />;
  return (
    <div className={styles.stub}>
      <p className={styles.stub__divider}>----- Вызовы -----</p>
      {activeCall ? (
        <div className={styles.stub__row}>
          <span className={styles.stub__number}>{activeCall.number}</span>
          <span>{activeCall.subscriberTitle}</span>
        </div>
      ) : null}
      {journal.slice(0, RECENT_CALLS_LIMIT).map((entry) => (
        <div key={entry.id} className={[styles.stub__row, styles["stub__row--past"]].join(" ")}>
          <span className={styles.stub__number}>{entry.number}</span>
          <span>{entry.subscriberTitle}</span>
          <span className={styles.stub__duration}>{formatDuration(getCallDurationMs(entry))}</span>
        </div>
      ))}
      {!activeCall && journal.length === 0 ? <p className={styles.stub__note}>Вызовов нет</p> : null}
      <p className={styles.stub__divider}>----- Конференции -----</p>
      <p className={styles.stub__note}>Управление вызовом — на экране активного вызова.</p>
    </div>
  );
}
