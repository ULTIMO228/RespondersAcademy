import type { ChartSeries } from "../../lib/selectStudentProgress";

type ChartDataTableProps = {
  caption: string;
  labelTitle: string;
  valueTitle: string;
  series: ChartSeries;
};

/** Табличный дубль графика для доступности (скринридеры): те же значения series. */
export function ChartDataTable({ caption, labelTitle, valueTitle, series }: ChartDataTableProps) {
  return (
    <table className="visually-hidden">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{labelTitle}</th>
          <th scope="col">{valueTitle}</th>
        </tr>
      </thead>
      <tbody>
        {series.labels.map((label, index) => (
          <tr key={`${label}-${index}`}>
            <th scope="row">{label}</th>
            <td>{series.values[index]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
