import { Tag } from "@/shared/ui/platform";

/** «Зачтено» / «Не зачтено»: слово и значок, не только цвет. */
export function ResultBadge({ passed }: { passed: boolean }) {
  return (
    <Tag tone={passed ? "success" : "danger"}>
      <span aria-hidden="true">{passed ? "✓" : "✗"}</span> {passed ? "Зачтено" : "Не зачтено"}
    </Tag>
  );
}
