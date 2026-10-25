import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, Calculator, ChevronLeft, ChevronRight, Layers3, MessageCircleQuestion, RotateCcw, Workflow } from "lucide-react";
import {
  evaluateInteractiveFormula,
  normalizeInteractiveAnswer,
  type InteractiveAnswer,
  type InteractiveAnswerCalculator,
  type InteractiveAnswerChart,
  type InteractiveAnswerComparison,
  type InteractiveAnswerDiagram,
  type InteractiveAnswerSection,
  type InteractiveAnswerSteps,
  type InteractiveAnswerText,
} from "@/modules/chat/interactive-answer";

const SERIES_COLORS = ["#8b9cff", "#62d6c5", "#f2b36f", "#d28be9"];

export type InteractiveAnswerBlockProps = {
  answer: InteractiveAnswer;
  onFollowUp?: (prompt: string) => void;
};

export function InteractiveAnswerBlock({ answer, onFollowUp }: InteractiveAnswerBlockProps) {
  const normalized = useMemo(
    () => normalizeInteractiveAnswer(answer as unknown as Record<string, unknown>, answer.id),
    [answer],
  );
  if (!normalized.ok) return null;

  const safeAnswer = normalized.answer;
  const followUp = (sectionTitle: string, context: string) => {
    if (!onFollowUp) return;
    onFollowUp(
      "Use the interactive answer titled \"" +
        safeAnswer.title +
        "\", specifically the section \"" +
        sectionTitle +
        "\", and this selected state: " +
        context +
        " Explain or compare it as requested.",
    );
  };

  return (
    <section className="my-2 overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--color-panel)]/65 shadow-lg shadow-black/10">
      <header className="flex items-start gap-3 border-b border-white/[0.07] px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-200">
          {safeAnswer.kind === "chart" ? (
            <BarChart3 className="size-4" />
          ) : safeAnswer.kind === "calculator" ? (
            <Calculator className="size-4" />
          ) : safeAnswer.kind === "comparison" || safeAnswer.kind === "board" ? (
            <Layers3 className="size-4" />
          ) : safeAnswer.kind === "diagram" ? (
            <Workflow className="size-4" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-snug text-white">{safeAnswer.title}</div>
          {safeAnswer.summary && (
            <p className="mb-0 mt-1 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
              {safeAnswer.summary}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-violet-300/15 bg-violet-300/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-violet-200/80">
          Interactive
        </span>
      </header>

      <div className="px-4 py-4">
        {safeAnswer.kind === "board" ? (
          <div className="space-y-5">
            {safeAnswer.sections.map((section) => (
              <section key={section.id} className="border-b border-white/[0.06] pb-5 last:border-b-0 last:pb-0">
                <div className="mb-2.5">
                  <h3 className="m-0 text-[11.5px] font-medium text-white/90">{section.title}</h3>
                  {section.summary && (
                    <p className="mb-0 mt-1 text-[10.5px] leading-relaxed text-[var(--color-text-dim)]">
                      {section.summary}
                    </p>
                  )}
                </div>
                <AnswerSection
                  answer={section}
                  onFollowUp={(context) => followUp(section.title, context)}
                  canFollowUp={Boolean(onFollowUp)}
                />
              </section>
            ))}
          </div>
        ) : (
          <AnswerSection
            answer={safeAnswer}
            onFollowUp={(context) => followUp(safeAnswer.title, context)}
            canFollowUp={Boolean(onFollowUp)}
          />
        )}
      </div>
    </section>
  );
}

function AnswerSection({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerSection;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  if (answer.kind === "chart") {
    return <ChartAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
  }
  if (answer.kind === "comparison") {
    return <ComparisonAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
  }
  if (answer.kind === "calculator") {
    return <CalculatorAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
  }
  if (answer.kind === "steps") {
    return <StepsAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
  }
  if (answer.kind === "diagram") {
    return <DiagramAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
  }
  return <TextAnswer answer={answer} onFollowUp={onFollowUp} canFollowUp={canFollowUp} />;
}

function TextAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerText;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  return (
    <div>
      <p className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-text-dim)]">
        {answer.body}
      </p>
      {canFollowUp && (
        <FollowUpButton label="Ask about this section" context={answer.body} onFollowUp={onFollowUp} />
      )}
    </div>
  );
}

function DiagramAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerDiagram;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  const [selectedId, setSelectedId] = useState(answer.nodes[0]?.id ?? "");
  const selectedNode = answer.nodes.find((node) => node.id === selectedId) ?? answer.nodes[0];
  const markerId = "diagram-arrow-" + answer.id.replace(/[^A-Za-z0-9_-]/g, "");
  const nodeById = new Map(answer.nodes.map((node) => [node.id, node]));
  const context = selectedNode ? selectedNode.label + ": " + selectedNode.description : answer.title;

  return (
    <div>
      <div className="relative min-h-56 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.018] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:18px_18px]">
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L5,2.5 L0,5 z" fill="#8b9cff" />
            </marker>
          </defs>
          {answer.edges.map((edge, index) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            return (
              <g key={edge.from + "-" + edge.to + "-" + index}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#8b9cff"
                  strokeOpacity="0.56"
                  strokeWidth="0.8"
                  markerEnd={`url(#${markerId})`}
                />
                {edge.label && (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 2}
                    textAnchor="middle"
                    fill="#c7cdee"
                    fontSize="3.2"
                    paintOrder="stroke"
                    stroke="#171a23"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {answer.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-pressed={selectedId === node.id}
            onClick={() => setSelectedId(node.id)}
            title={node.label}
            className={`absolute max-w-[28%] -translate-x-1/2 -translate-y-1/2 truncate rounded-lg border px-3 py-2 text-[10px] font-medium shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 ${
              selectedId === node.id
                ? "border-violet-300/55 bg-[#242839] text-white"
                : "border-white/[0.12] bg-[#1d212b] text-white/80 hover:border-violet-300/35 hover:text-white"
            }`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            {node.label}
          </button>
        ))}
      </div>
      {selectedNode && (
        <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.018] px-3 py-2.5">
          <h3 className="m-0 text-[11.5px] font-medium text-white">{selectedNode.label}</h3>
          <p className="mb-0 mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {selectedNode.description}
          </p>
        </div>
      )}
      {canFollowUp && (
        <FollowUpButton label="Ask about this part" context={context} onFollowUp={onFollowUp} />
      )}
    </div>
  );
}

function FollowUpButton({
  label,
  context,
  onFollowUp,
}: {
  label: string;
  context: string;
  onFollowUp: (context: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFollowUp(context)}
      className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.025] px-2.5 text-[10.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:border-violet-300/25 hover:bg-violet-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-300/40"
    >
      <MessageCircleQuestion className="size-3.5" />
      {label}
    </button>
  );
}

function ChartAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerChart;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  const values = answer.series.flatMap((series) => series.values);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = maxValue - minValue || 1;
  const chart = { x: 54, y: 22, width: 626, height: 216 };
  const zeroY = chart.y + (maxValue / range) * chart.height;
  const groupWidth = chart.width / answer.labels.length;
  const barWidth = Math.min(30, groupWidth / (answer.series.length + 1));
  const points = answer.labels.map((label, index) => ({
    label,
    x: chart.x + groupWidth * (index + 0.5),
  }));
  const chartContext = answer.series
    .map((series) => series.name + ": " + series.values.map((value, index) => answer.labels[index] + " " + value).join(", "))
    .join("; ");
  const horizontalLayout = answer.chartType === "bar" && (
    answer.orientation === "horizontal" ||
    answer.labels.length > 6 ||
    answer.labels.some((label) => label.length > 14)
  );

  if (horizontalLayout) {
    const horizontalMin = Math.min(0, ...values);
    const horizontalMax = Math.max(0, ...values);
    const horizontalRange = horizontalMax - horizontalMin || 1;
    const zeroPosition = ((0 - horizontalMin) / horizontalRange) * 100;
    const ticks = [0, 0.5, 1].map((fraction) => horizontalMin + horizontalRange * fraction);

    return (
      <div>
        {answer.yAxisLabel && (
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            {answer.yAxisLabel}
          </p>
        )}
        <div className="space-y-3.5">
          {answer.labels.map((label, labelIndex) => (
            <div key={label + labelIndex} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-x-3">
              <span title={label} className="break-words pt-0.5 text-right text-[10.5px] leading-snug text-[var(--color-text-dim)]">
                {label}
              </span>
              <div className="min-w-0 space-y-1.5">
                {answer.series.map((series, seriesIndex) => {
                  const value = series.values[labelIndex];
                  const valuePosition = ((value - horizontalMin) / horizontalRange) * 100;
                  const left = Math.min(zeroPosition, valuePosition);
                  const width = Math.max(0.7, Math.abs(valuePosition - zeroPosition));
                  return (
                    <div key={series.name + label} className="flex min-w-0 items-center gap-2">
                      <div
                        role="img"
                        aria-label={series.name + ", " + label + ": " + formatNumber(value)}
                        className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-white/[0.035]"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 w-px bg-white/25"
                          style={{ left: `${zeroPosition}%` }}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 rounded-sm"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
                          }}
                        />
                      </div>
                      <span title={series.name + ": " + formatNumber(value)} className="w-[4.75rem] shrink-0 text-right text-[10px] tabular-nums text-white/80">
                        {formatNumber(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-x-3">
          <span />
          <div className="flex justify-between text-[9px] tabular-nums text-[var(--color-text-dim)]/80">
            {ticks.map((tick, index) => (
              <span key={index}>{formatNumber(tick)}</span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {answer.series.map((series, index) => (
            <span key={series.name} className="inline-flex items-center gap-1.5 text-[9.5px] text-[var(--color-text-dim)]">
              <span className="size-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
              {series.name}
            </span>
          ))}
        </div>
        {canFollowUp && (
          <FollowUpButton label="Ask about this chart" context={chartContext} onFollowUp={onFollowUp} />
        )}
      </div>
    );
  }

  const tickStep = Math.max(1, Math.ceil((points.length - 1) / 5));

  return (
    <div>
      {answer.yAxisLabel && (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          {answer.yAxisLabel}
        </p>
      )}
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 720 300"
          role="img"
          aria-label={answer.title + " " + answer.chartType + " chart"}
          className="block min-w-[520px] w-full overflow-visible"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = chart.y + fraction * chart.height;
            const value = maxValue - fraction * range;
            return (
              <g key={fraction}>
                <line
                  x1={chart.x}
                  x2={chart.x + chart.width}
                  y1={y}
                  y2={y}
                  stroke={fraction === maxValue / range ? "#ffffff38" : "#ffffff13"}
                  strokeWidth="1"
                />
                <text
                  x={chart.x - 9}
                  y={y + 3}
                  textAnchor="end"
                  fill="#8790a3"
                  fontSize="9"
                >
                  {formatNumber(value)}
                </text>
              </g>
            );
          })}
          {answer.chartType === "bar" &&
            answer.labels.map((label, labelIndex) =>
              answer.series.map((series, seriesIndex) => {
                const value = series.values[labelIndex];
                const valueY = chart.y + ((maxValue - value) / range) * chart.height;
                const x =
                  chart.x +
                  groupWidth * labelIndex +
                  (groupWidth - barWidth * answer.series.length) / 2 +
                  barWidth * seriesIndex;
                return (
                  <rect
                    key={series.name + label}
                    x={x}
                    y={Math.min(zeroY, valueY)}
                    width={Math.max(3, barWidth - 3)}
                    height={Math.max(1, Math.abs(zeroY - valueY))}
                    rx="3"
                    fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                    fillOpacity="0.82"
                  >
                    <title>{series.name + " · " + label + ": " + value}</title>
                  </rect>
                );
              }),
            )}
          {answer.chartType === "line" &&
            answer.series.map((series, seriesIndex) => {
              const coordinates = series.values.map((value, index) => {
                const x = points[index].x;
                const y = chart.y + ((maxValue - value) / range) * chart.height;
                return { x, y };
              });
              return (
                <g key={series.name}>
                  <polyline
                    points={coordinates.map(({ x, y }) => x + "," + y).join(" ")}
                    fill="none"
                    stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {coordinates.map(({ x, y }, index) => (
                    <circle
                      key={answer.labels[index]}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#151923"
                      stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                      strokeWidth="2"
                    >
                      <title>{series.name + " · " + answer.labels[index] + ": " + series.values[index]}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
          {points.map(({ label, x }, index) => {
            if (answer.chartType === "line" && index % tickStep !== 0 && index !== points.length - 1) return null;
            return (
              <text
                key={label + index}
                x={x}
                y={chart.y + chart.height + 22}
                textAnchor="middle"
                fill="#9aa2b1"
                fontSize="10"
              >
                <title>{label}</title>
                {label.length > 14 ? label.slice(0, 13) + "…" : label}
              </text>
            );
          })}
          {answer.series.map((series, index) => {
            const x = chart.x + index * 150;
            return (
              <g key={series.name} transform={"translate(" + x + ", 282)"}>
                <circle r="4" fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                <text x="9" y="3.5" fill="#c5cad4" fontSize="10">
                  {series.name.length > 20 ? series.name.slice(0, 19) + "…" : series.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {canFollowUp && (
        <FollowUpButton
          label="Ask about this chart"
          context={chartContext}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}

function ComparisonAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerComparison;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  const context = answer.rows
    .map((row) => row.label + ": " + row.values.map((value, index) => answer.columns[index] + " = " + value).join(", "))
    .join("; ");

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
        <table className="w-full min-w-[480px] border-collapse text-left text-[11.5px]">
          <thead className="bg-white/[0.035]">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium text-[var(--color-text-dim)]">
                Criteria
              </th>
              {answer.columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2.5 font-medium text-white/80">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {answer.rows.map((row, rowIndex) => (
              <tr key={row.label} className={rowIndex > 0 ? "border-t border-white/[0.06]" : ""}>
                <th scope="row" className="max-w-36 px-3 py-2.5 font-medium text-white/75">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={answer.columns[index]} className="px-3 py-2.5 leading-relaxed text-[var(--color-text-dim)]">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canFollowUp && (
        <FollowUpButton
          label="Ask about this comparison"
          context={context}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}

function CalculatorAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerCalculator;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(answer.inputs.map((input) => [input.id, input.value])),
  );
  const outputs = useMemo(
    () => answer.outputs ?? [{ label: answer.resultLabel, formula: answer.formula, suffix: answer.resultSuffix }],
    [answer.outputs, answer.resultLabel, answer.formula, answer.resultSuffix],
  );
  const results = useMemo(
    () => outputs.map((output) => ({
      ...output,
      value: evaluateInteractiveFormula(output.formula, values),
    })),
    [outputs, values],
  );
  const changed = answer.inputs.some((input) => values[input.id] !== input.value);

  const updateValue = (id: string, value: number) => {
    setValues((current) => ({ ...current, [id]: value }));
  };
  const resetValues = () => {
    setValues(Object.fromEntries(answer.inputs.map((input) => [input.id, input.value])));
  };
  const context =
    answer.inputs.map((input) => input.label + " = " + values[input.id] + (input.suffix ?? "")).join(", ") +
    results.map((result) => result.value === undefined
      ? ""
      : ", " + result.label + " = " + formatNumber(result.value) + (result.suffix ?? ""),
    ).join("");

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          disabled={!changed}
          onClick={resetValues}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[10px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-300/50 disabled:cursor-default disabled:opacity-35"
        >
          <RotateCcw className="size-3" />
          Reset inputs
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {answer.inputs.map((input) => (
          <label key={input.id} className="rounded-lg border border-white/[0.07] bg-white/[0.018] px-3 py-2.5">
            <span className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-medium text-white/80">{input.label}</span>
              <output className="tabular-nums text-violet-200">
                {formatNumber(values[input.id])}
                {input.suffix}
              </output>
            </span>
            <input
              type="range"
              aria-label={input.label}
              min={input.min}
              max={input.max}
              step={input.step}
              value={values[input.id]}
              onChange={(event) => updateValue(input.id, Number(event.currentTarget.value))}
              className="mt-2.5 block h-1.5 w-full cursor-pointer accent-violet-300"
            />
            <span className="mt-1 flex justify-between text-[9px] tabular-nums text-[var(--color-text-dim)]/75">
              <span>{formatNumber(input.min)}{input.suffix}</span>
              <span>{formatNumber(input.max)}{input.suffix}</span>
            </span>
          </label>
        ))}
      </div>
      <div className={`mt-3 grid gap-2 ${results.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {results.map((result) => (
          <div key={result.label} className="flex min-w-0 flex-wrap items-end justify-between gap-2 rounded-lg border border-violet-300/15 bg-violet-300/[0.045] px-3.5 py-3">
            <span className="text-[11px] font-medium text-[var(--color-text-dim)]">{result.label}</span>
            <output aria-live="polite" className="text-[21px] font-medium tabular-nums tracking-tight text-white">
              {result.value === undefined ? "—" : formatNumber(result.value) + (result.suffix ?? "")}
            </output>
          </div>
        ))}
      </div>
      {canFollowUp && (
        <FollowUpButton
          label="Ask about these values"
          context={context}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}

function StepsAnswer({
  answer,
  onFollowUp,
  canFollowUp,
}: {
  answer: InteractiveAnswerSteps;
  onFollowUp: (context: string) => void;
  canFollowUp: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = answer.steps[Math.min(stepIndex, answer.steps.length - 1)];
  const context = "step " + (stepIndex + 1) + " of " + answer.steps.length + ": " + step.title + " — " + step.description;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          Step {stepIndex + 1} <span className="text-white/25">/</span> {answer.steps.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous step"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next step"
            disabled={stepIndex === answer.steps.length - 1}
            onClick={() => setStepIndex((index) => Math.min(answer.steps.length - 1, index + 1))}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-violet-300/80 transition-[width]"
          style={{ width: ((stepIndex + 1) / answer.steps.length) * 100 + "%" }}
        />
      </div>
      <div className="min-h-24 rounded-lg border border-white/[0.07] bg-white/[0.018] px-4 py-3.5">
        <h3 className="m-0 text-[13px] font-medium text-white">{step.title}</h3>
        <p className="mb-0 mt-2 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          {step.description}
        </p>
      </div>
      {canFollowUp && (
        <FollowUpButton
          label="Ask about this step"
          context={context}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
