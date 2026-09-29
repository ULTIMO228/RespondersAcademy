import type { ReferenceData } from "@/shared/api";
import { Card, DataTable, Tag } from "@/shared/ui/platform";

/** Статусы: жизненный цикл карточки ДДС с допустимыми переходами и статусы карточки целиком (по справочнику АРМ). */
export function StatusesTab({ reference }: { reference: ReferenceData }) {
  const titleByStatus = new Map(reference.ddsStatuses.map((item) => [item.status, item.title]));
  return (
    <>
      <Card title="Статусы реагирования (диспетчер ДДС)">
        <DataTable
          caption="Статусы реагирования"
          rows={reference.ddsStatuses}
          getRowKey={(row) => row.status}
          columns={[
            { key: "title", title: "Статус", render: (row) => row.title },
            {
              key: "comment",
              title: "Комментарий",
              render: (row) => (row.requiresComment ? <Tag tone="warning">обязателен</Tag> : "не нужен"),
            },
            {
              key: "next",
              title: "Дальше",
              render: (row) =>
                row.next.length === 0
                  ? "конец цепочки"
                  : row.next.map((next) => titleByStatus.get(next) ?? next).join(", "),
            },
          ]}
        />
      </Card>
      <br />
      <Card title="Статусы карточки">
        <DataTable
          caption="Статусы карточки"
          rows={reference.cardStatuses}
          getRowKey={(row) => row.status}
          columns={[
            { key: "title", title: "Статус", render: (row) => row.title },
            {
              key: "alert",
              title: "Индикация",
              render: (row) => (row.alert ? <Tag tone="danger">красная</Tag> : "обычная"),
            },
          ]}
        />
      </Card>
    </>
  );
}
