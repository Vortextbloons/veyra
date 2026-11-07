/* eslint-disable react-refresh/only-export-components */
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CHART_COLORS, bg, color, cx, numberText } from "./style";

const isNode = (value: unknown) =>
  !!value && typeof value === "object" && (value as { type?: unknown }).type === "element";

export const Table = defineComponent({
  name: "Table",
  props: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.any())),
  }),
  description:
    "Each row lists its cells in column order; a cell may be a component. Number columns align right.",
  component: ({ props, renderNode }) => {
    const columns = props.columns ?? [];
    const rows = (props.rows ?? []).filter((row) => Array.isArray(row));
    const numeric = columns.map((_, index) =>
      rows.length > 0 && rows.every((row) => typeof row[index] === "number"),
    );
    return (
      <div className="min-w-0 overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="bg-white/[0.04]">
              {columns.map((column, index) => (
                <th
                  key={column + index}
                  scope="col"
                  className={cx(
                    "border-b border-white/[0.08] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-dim)]",
                    numeric[index] && "text-right",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="even:bg-white/[0.015]">
                {columns.map((_, cellIndex) => {
                  const cell = row[cellIndex];
                  return (
                    <td
                      key={cellIndex}
                      className={cx(
                        "border-b border-white/[0.05] px-2.5 py-1.5 align-top leading-snug text-[var(--color-text)]",
                        numeric[cellIndex] && "text-right tabular-nums",
                      )}
                    >
                      {isNode(cell) ? (
                        renderNode(cell)
                      ) : typeof cell === "number" ? (
                        numberText(cell)
                      ) : (
                        String(cell ?? "")
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

type Row = Record<string, string | number>;

const formatValue = (value: number, format?: string, currency?: string) => {
  if (format === "percent") return `${numberText(value)}%`;
  if (format === "currency") {
    try {
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
      });
    } catch {
      return `$${numberText(value)}`;
    }
  }
  return numberText(value);
};

const compact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${numberText(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${numberText(value / 1_000)}k`;
  return numberText(value);
};

export const Chart = defineComponent({
  name: "Chart",
  props: z.object({
    type: z.enum(["bar", "line", "area", "pie", "donut"]),
    data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
    x: z.string().optional(),
    series: z.array(z.string()).optional(),
    format: z.enum(["number", "currency", "percent"]).optional(),
    currency: z.string().optional(),
    stacked: z.boolean().optional(),
    height: z.number().optional(),
  }),
  description:
    "Rows of data; x is the category key, series the value keys (default: every number key). percent values are like 45; currency is a code like \"EUR\".",
  component: ({ props }) => {
    const data = (props.data ?? []).filter((row): row is Row => !!row && typeof row === "object");
    if (!data.length) return null;
    const keys = Object.keys(data[0]);
    const xKey = props.x && keys.includes(props.x) ? props.x : keys.find((key) => typeof data[0][key] === "string") ?? keys[0];
    const seriesKeys = (props.series?.length ? props.series : keys.filter((key) => key !== xKey && data.some((row) => typeof row[key] === "number"))).filter(
      (key) => keys.includes(key),
    );
    const labels = data.map((row) => String(row[xKey] ?? ""));
    const height = props.height && props.height > 60 ? Math.min(520, Math.round(props.height)) : 190;

    if (props.type === "pie" || props.type === "donut") {
      return (
        <PieChart
          labels={labels}
          values={data.map((row) => Number(row[seriesKeys[0]] ?? 0))}
          donut={props.type === "donut"}
          format={props.format}
          currency={props.currency}
          height={height}
        />
      );
    }

    const series = seriesKeys.map((key) => ({
      key,
      values: data.map((row) => {
        const value = Number(row[key] ?? 0);
        return Number.isFinite(value) ? value : 0;
      }),
    }));
    if (!series.length) return null;
    return (
      <CartesianChart
        type={props.type}
        labels={labels}
        series={series}
        stacked={props.stacked === true}
        format={props.format}
        currency={props.currency}
        height={height}
      />
    );
  },
});

function Legend({ series }: { series: { key: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {series.map((entry, index) => (
        <span key={entry.key} className="inline-flex items-center gap-1 text-[9.5px] text-[var(--color-text-dim)]">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
          {entry.key}
        </span>
      ))}
    </div>
  );
}

function CartesianChart({
  type,
  labels,
  series,
  stacked,
  format,
  currency,
  height,
}: {
  type: "bar" | "line" | "area";
  labels: string[];
  series: { key: string; values: number[] }[];
  stacked: boolean;
  format?: string;
  currency?: string;
  height: number;
}) {
  const width = 640;
  const pad = { top: 10, right: 8, bottom: 22, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totals = stacked
    ? labels.map((_, index) => series.reduce((sum, entry) => sum + Math.max(0, entry.values[index] ?? 0), 0))
    : series.flatMap((entry) => entry.values);
  const maxValue = Math.max(0, ...totals);
  const minValue = Math.min(0, ...totals);
  const range = maxValue - minValue || 1;
  const y = (value: number) => pad.top + ((maxValue - value) / range) * plotH;
  const band = plotW / Math.max(1, labels.length);
  const barWidth = stacked
    ? Math.min(26, band * 0.55)
    : Math.min(18, (band * 0.7) / Math.max(1, series.length));
  const tickValues = [maxValue, minValue + range / 2, minValue];

  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={`${type} chart`}>
        {tickValues.map((value, index) => (
          <g key={index}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(value)}
              y2={y(value)}
              stroke="color-mix(in srgb, var(--color-text) 9%, transparent)"
              strokeWidth="1"
            />
            <text x={pad.left - 6} y={y(value) + 3} textAnchor="end" fontSize="9" fill="var(--color-text-dim)">
              {compact(value)}
            </text>
          </g>
        ))}
        {type === "bar"
          ? labels.map((label, index) => {
              let positive = 0;
              let negative = 0;
              return (
                <g key={label + index}>
                  {series.map((entry, seriesIndex) => {
                    const value = entry.values[index] ?? 0;
                    const base = value >= 0 ? positive : negative;
                    const top = value >= 0 ? y(base + value) : y(base);
                    const barHeight = Math.max(0.5, Math.abs(y(base + value) - y(base)));
                    if (stacked) {
                      if (value >= 0) positive += value;
                      else negative += value;
                    }
                    const offset = stacked
                      ? 0
                      : (seriesIndex - (series.length - 1) / 2) * barWidth;
                    return (
                      <rect
                        key={entry.key}
                        x={pad.left + band * (index + 0.5) + offset - barWidth / 2}
                        y={top}
                        width={barWidth}
                        height={barHeight}
                        rx="2"
                        fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                      >
                        <title>{`${entry.key} · ${label}: ${formatValue(value, format, currency)}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })
          : series.map((entry, seriesIndex) => {
              const points = entry.values
                .map((value, index) => `${pad.left + band * (index + 0.5)},${y(value)}`)
                .join(" ");
              const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
              return (
                <g key={entry.key}>
                  {type === "area" ? (
                    <polygon
                      points={`${pad.left + band * 0.5},${y(minValue)} ${points} ${pad.left + band * (labels.length - 0.5)},${y(minValue)}`}
                      fill={color}
                      fillOpacity="0.16"
                    />
                  ) : null}
                  <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {entry.values.map((value, index) => (
                    <circle
                      key={index}
                      cx={pad.left + band * (index + 0.5)}
                      cy={y(value)}
                      r="2.5"
                      fill={color}
                    >
                      <title>{`${entry.key} · ${labels[index]}: ${formatValue(value, format, currency)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
        {labels.map((label, index) => {
          const step = Math.max(1, Math.ceil(labels.length / 8));
          if (index % step !== 0) return null;
          return (
            <text
              key={label + index}
              x={pad.left + band * (index + 0.5)}
              y={height - 6}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-text-dim)"
            >
              {label.length > 14 ? `${label.slice(0, 13)}…` : label}
            </text>
          );
        })}
      </svg>
      <Legend series={series} />
    </div>
  );
}

function PieChart({
  labels,
  values,
  donut,
  format,
  currency,
  height,
}: {
  labels: string[];
  values: number[];
  donut: boolean;
  format?: string;
  currency?: string;
  height: number;
}) {
  const size = Math.max(120, Math.min(height, 260));
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  const radius = size / 2 - 4;
  const center = size / 2;
  const sweeps = values.map((value) => (Math.max(0, value) / total) * Math.PI * 2);
  const slices = values.map((value, index) => {
    const start = -Math.PI / 2 + sweeps.slice(0, index).reduce((sum, sweep) => sum + sweep, 0);
    const end = start + sweeps[index];
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const large = sweeps[index] > Math.PI ? 1 : 0;
    const inner = donut ? radius * 0.58 : 0;
    const path =
      sweeps[index] >= Math.PI * 1.999
        ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius} Z`
        : donut
          ? [
              `M ${center + inner * Math.cos(start)} ${center + inner * Math.sin(start)}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`,
              `L ${center + inner * Math.cos(end)} ${center + inner * Math.sin(end)}`,
              `A ${inner} ${inner} 0 ${large} 0 ${center + inner * Math.cos(start)} ${center + inner * Math.sin(start)}`,
              "Z",
            ].join(" ")
          : `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
    return { path, label: labels[index] ?? "", value };
  });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="pie chart">
        {slices.map((slice, index) => (
          <path key={slice.label + index} d={slice.path} fill={CHART_COLORS[index % CHART_COLORS.length]}>
            <title>{`${slice.label}: ${formatValue(slice.value, format, currency)}`}</title>
          </path>
        ))}
      </svg>
      <ul className="m-0 flex min-w-0 flex-col gap-1 p-0">
        {slices.map((slice, index) => (
          <li key={slice.label + index} className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
            <span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="min-w-0 truncate text-[var(--color-text)]">{slice.label}</span>
            <span className="tabular-nums">{formatValue(slice.value, format, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const Progress = defineComponent({
  name: "Progress",
  props: z.object({
    value: z.number(),
    max: z.number().optional(),
    label: z.string().optional(),
    color: color.optional(),
  }),
  description: "A horizontal bar showing value out of max.",
  component: ({ props }) => {
    const max = props.max && props.max > 0 ? props.max : 100;
    const ratio = Math.max(0, Math.min(1, props.value / max));
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {props.label ? (
          <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-[var(--color-text-dim)]">
            <span>{props.label}</span>
            <span className="tabular-nums">{Math.round(ratio * 100)}%</span>
          </div>
        ) : null}
        <div
          role="progressbar"
          aria-valuenow={Math.round(props.value)}
          aria-valuemin={0}
          aria-valuemax={max}
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-text) 10%, transparent)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${ratio * 100}%`,
              background: bg(props.color) ?? "var(--color-accent)",
            }}
          />
        </div>
      </div>
    );
  },
});

