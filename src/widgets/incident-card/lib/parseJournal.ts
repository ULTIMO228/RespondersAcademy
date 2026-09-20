export type JournalEntry = {
  at?: string;
  author?: string;
  text: string;
};

/* «17.09.2026 11:13:19 УМЦ О.п. - Пожар в квартире» (разделитель — дефис или тире). */
const JOURNAL_LINE = /^(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}) (.+?) [-—] (.+)$/;

/** Строки «Журнала событий / описания» из описания фикстуры. */
export function parseJournal(description: string): JournalEntry[] {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = JOURNAL_LINE.exec(line);
      return match ? { at: match[1], author: match[2], text: match[3] } : { text: line };
    });
}
