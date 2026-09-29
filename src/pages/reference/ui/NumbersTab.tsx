import type { InternalNumber } from "@/shared/api";
import { Card, DataTable } from "@/shared/ui/platform";

import { filterNumbers } from "../lib/search";

/** Служебные (внутренние) номера точки C: 101–104 и руководитель смены. */
export function NumbersTab({ numbers, query }: { numbers: InternalNumber[]; query: string }) {
  return (
    <Card>
      <DataTable
        caption="Служебные номера"
        emptyText="Номера не найдены"
        rows={filterNumbers(numbers, query)}
        getRowKey={(row) => row.number}
        columns={[
          { key: "number", title: "Номер", numeric: true, render: (row) => row.number },
          { key: "title", title: "Назначение", render: (row) => row.title },
        ]}
      />
    </Card>
  );
}
