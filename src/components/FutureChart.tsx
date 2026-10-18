import type { FutureProjection } from "../helpers/projectFuture";
import { formatMoney } from "../helpers/formatMoney";
export type ChartTimeline = {
  id: string;
  name: string;
  color: string;
  projection: FutureProjection;
  preview?: boolean;
};
export function FutureChart({
  timelines,
  selected,
  onSelect,
}: {
  timelines: ChartTimeline[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const startYear = timelines[0]?.projection.points[0].year ?? 2026;
  const endYear = timelines[0]?.projection.end.year ?? 2036;
  const totalMonths = (endYear - startYear) * 12;
  const step = Math.max(1, Math.ceil((endYear - startYear) / 5));
  const ticks = Array.from(
    { length: Math.floor((endYear - startYear) / step) + 1 },
    (_, i) => startYear + i * step,
  );
  if (ticks.at(-1) !== endYear) ticks.push(endYear);
  const values = timelines.flatMap((t) =>
      t.projection.points.map((p) => p.netWorth),
    ),
    min = Math.min(0, ...values),
    max = Math.max(1000, ...values),
    span = Math.max(1, max - min),
    x = (month: number) => 58 + (month / totalMonths) * 630,
    y = (n: number) => 18 + ((max - n) / span) * 220;
  return (
    <svg
      viewBox="0 0 720 290"
      style={{ width: "100%", overflow: "visible" }}
      role="img"
      aria-label={`Modeled net worth from ${startYear} to ${endYear}. Gray shows current habits; dotted blue shows your changes. Use the buttons below to compare.`}
    >
      <title>{`Net worth projections through ${endYear}`}</title>
      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
        const value = min + span * r;
        return (
          <g key={r}>
            <line
              x1="58"
              x2="688"
              y1={y(value)}
              y2={y(value)}
              stroke="#e8edf1"
            />
            <text
              x="48"
              y={y(value) + 4}
              textAnchor="end"
              fill="#617985"
              fontSize="10"
            >
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(value)}
            </text>
          </g>
        );
      })}
      {timelines.map((t) => (
        <polyline
          key={t.id}
          points={t.projection.points
            .map((p) => x(p.month) + "," + y(p.netWorth))
            .join(" ")}
          fill="none"
          stroke={t.color}
          strokeWidth={selected === t.id ? 3.5 : 2}
          opacity={selected === t.id || t.preview ? 1 : 0.55}
          strokeDasharray={t.preview ? "3 6" : undefined}
          strokeLinejoin="round"
          onClick={() => !t.preview && onSelect(t.id)}
          style={{ cursor: t.preview ? "default" : "pointer" }}
        >
          <title>{`${t.name}: ${formatMoney(t.projection.end.netWorth)} in ${endYear}`}</title>
        </polyline>
      ))}
      {ticks.map((year) => (
        <text
          key={year}
          x={x((year - startYear) * 12)}
          y="269"
          textAnchor="middle"
          fill="#617985"
          fontSize="11"
        >
          {year}
        </text>
      ))}
    </svg>
  );
}
