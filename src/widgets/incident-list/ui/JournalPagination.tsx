import type { ChangeEvent } from "react";

import { ArmIcon } from "@/shared/ui";

import { PAGE_SIZE_OPTIONS } from "../config/journalOptions";
import type { JournalPage } from "../model/useJournalList";
import styles from "./JournalPagination.module.css";

type JournalPaginationProps = {
  page: JournalPage;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const ARROW_SIZE = 18;

/** «Страница: 1 ▾ · Записей на странице: 10 ▾ · 1-10 из N ‹ ›» (ДДС_image2–5). */
export function JournalPagination({ page, onPageChange, onPageSizeChange }: JournalPaginationProps) {
  const pageNumbers = Array.from({ length: page.pageCount }, (_, index) => index + 1);
  const isEmpty = page.total === 0;

  function handlePageSelect(event: ChangeEvent<HTMLSelectElement>) {
    onPageChange(Number(event.target.value) - 1);
  }

  function handleSizeSelect(event: ChangeEvent<HTMLSelectElement>) {
    onPageSizeChange(Number(event.target.value));
  }

  return (
    <footer className={styles.pagination} aria-label="Пагинация">
      <label className={styles.pagination__field}>
        Страница:
        <select
          className={styles.pagination__select}
          value={isEmpty ? "" : page.pageIndex + 1}
          onChange={handlePageSelect}
        >
          {isEmpty ? <option value="" /> : null}
          {pageNumbers.map((pageNumber) => (
            <option key={pageNumber} value={pageNumber}>
              {pageNumber}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.pagination__field}>
        Записей на странице:
        <select className={styles.pagination__select} value={page.pageSize} onChange={handleSizeSelect}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <strong className={styles.pagination__range}>{page.rangeLabel}</strong>
      <button
        type="button"
        className={styles.pagination__arrow}
        aria-label="Предыдущая страница"
        disabled={page.pageIndex === 0}
        onClick={() => onPageChange(page.pageIndex - 1)}
      >
        <ArmIcon name="pagination-prev" size={ARROW_SIZE} />
      </button>
      <button
        type="button"
        className={styles.pagination__arrow}
        aria-label="Следующая страница"
        disabled={page.pageIndex >= page.pageCount - 1}
        onClick={() => onPageChange(page.pageIndex + 1)}
      >
        <ArmIcon name="pagination-next" size={ARROW_SIZE} />
      </button>
    </footer>
  );
}
