import { useState } from "react";

/** Множество id с переключением (раскрытые строки, открытые цепочки, «важные»). */
export function useIdSet(initialIds: string[]) {
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialIds));

  function toggle(id: string) {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { ids, toggle };
}
