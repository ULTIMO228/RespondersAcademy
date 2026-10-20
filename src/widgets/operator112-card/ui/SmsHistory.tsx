"use client";

import styles from "./SmsHistory.module.css";

export type SmsMessage = {
  id: string;
  /** Номер оператора. */
  operator: string;
  /** Уже отформатированные «02.04.2019 09:34». */
  dateTime: string;
  /** «получено», «прочитана»… */
  status: string;
  phone: string;
  text: string;
};

type SmsHistoryProps = {
  messages: SmsMessage[];
  /** Счётчик непрочитанных рядом с заголовком. */
  unread: number;
  onBack: () => void;
};

/** Окно «История сообщений N» поверх карточки (ИНСТРУКЦИЯ_image112; спека 009, FR-029). */
export function SmsHistory({ messages, unread, onBack }: SmsHistoryProps) {
  return (
    <div className={styles.history__overlay}>
      <section className={styles.history} aria-label="История сообщений">
        <h2 className={styles.history__title}>
          История сообщений <span className={styles.history__count}>{unread}</span>
        </h2>
        <div className={styles.history__body}>
          <table className={styles.history__table}>
            <thead>
              <tr>
                <th scope="col">Опер.</th>
                <th scope="col">Дата и время</th>
                <th scope="col">Статус</th>
                <th scope="col">Телефон</th>
                <th scope="col">Текст сообщения</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id}>
                  <td>{message.operator}</td>
                  <td>{message.dateTime}</td>
                  <td>{message.status}</td>
                  <td>{message.phone}</td>
                  <td>{message.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {messages.length === 0 ? <p className={styles.history__empty}>Сообщений нет</p> : null}
        </div>
        <button type="button" className={styles.history__back} onClick={onBack}>
          ← вернуться в карточку
        </button>
      </section>
    </div>
  );
}
