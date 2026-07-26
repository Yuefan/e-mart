import type { BreakdownDimension, BreakdownRow } from "@/lib/gsc-queries";
import { getT } from "@/lib/i18n";
import { cn, formatNumber, formatPercent, formatPosition, shortenUrl } from "@/lib/utils";
import { Card, CardHeader } from "./ui";

function renderLabel(dimension: BreakdownDimension, value: string) {
  if (dimension === "page") {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="hover:text-accent hover:underline"
      >
        {shortenUrl(value)}
      </a>
    );
  }
  if (dimension === "country") return value.toUpperCase();
  if (dimension === "device") return value.charAt(0) + value.slice(1).toLowerCase();
  return value;
}

export async function BreakdownTable({
  title,
  dimension,
  rows,
  hint,
}: {
  title: string;
  dimension: BreakdownDimension;
  rows: BreakdownRow[];
  hint?: string;
}) {
  const { t } = await getT();

  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} hint={hint} />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{t.overview.noDataWindow}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-5 py-2 text-left font-medium">
                  {dimension === "query"
                    ? t.overview.query
                    : dimension === "page"
                      ? t.overview.pageCol
                      : t.overview.value}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t.overview.clicks}</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 text-right font-medium">{t.overview.impr}</th>
                <th className="px-3 py-2 text-right font-medium">{t.overview.ctr}</th>
                <th className="px-5 py-2 text-right font-medium">{t.overview.pos}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.value}
                  className="border-b border-line/60 last:border-0 hover:bg-panel-alt"
                >
                  <td className="max-w-[280px] truncate px-5 py-2">
                    {renderLabel(dimension, row.value)}
                  </td>
                  <td className="tnum px-3 py-2 text-right">{formatNumber(row.clicks)}</td>
                  <td
                    className={cn(
                      "tnum px-3 py-2 text-right",
                      row.deltaClicks > 0 && "text-pos",
                      row.deltaClicks < 0 && "text-neg",
                      row.deltaClicks === 0 && "text-muted",
                    )}
                  >
                    {row.deltaClicks > 0 ? "+" : ""}
                    {formatNumber(row.deltaClicks)}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted">
                    {formatNumber(row.impressions)}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted">
                    {formatPercent(row.ctr, 1)}
                  </td>
                  <td className="tnum px-5 py-2 text-right text-muted">
                    {formatPosition(row.position)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
