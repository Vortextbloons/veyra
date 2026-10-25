import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, Calculator, ChevronLeft, ChevronRight, Layers3, MessageCircleQuestion } from "lucide-react";
import {
  evaluateInteractiveFormula,
  normalizeInteractiveAnswer,
  type InteractiveAnswer,
  type InteractiveAnswerCalculator,
  type InteractiveAnswerChart,
  type InteractiveAnswerComparison,
  type InteractiveAnswerSteps,
} from "@/modules/chat/interactive-answer";

const SERIES_COLORS = ["#8b9cff", "#62d6c5", "#f2b36f", "#d28be9"];

export type InteractiveAnswerBlockProps = {
  answer: InteractiveAnswer;
  onFollowUp?: (prompt: string) => void;
};

export function InteractiveAnswerBlock({ answer, onFollowUp }: InteractiveAnswerBlockProps) {
  const normalized = normalizeInteractiveAnswer(
    answer as unknown as Record<string, unknown>,
    answer.id,
  );
  if (!normalized.ok) return null;

  const safeAnswer = normalized.answer;
  const followUp = (context: string) => {
    if (!onFollowUp) return;
    onFollowUp(
      "Use the interactive answer titled \"" +
        safeAnswer.title +
        "\" and this selected state: " +
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
          ) : safeAnswer.kind === "comparison" ? (
            <Layers3 className="size-4" />
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
        {safeAnswer.kind === "chart" && (
          <ChartAnswer
            answer={safeAnswer}
            onFollowUp={(context) => followUp(context)}
            canFollowUp={Boolean(onFollowUp)}
          />
        )}
        {safeAnswer.kind === "comparison" && (
          <ComparisonAnswer
            answer={safeAnswer}
            onFollowUp={(context) => followUp(context)}
            canFollowUp={Boolean(onFollowUp)}
          />
        )}
        {safeAnswer.kind === "calculator" && (
          <CalculatorAnswer
            answer={safeAnswer}
            onFollowUp={(context) => followUp(context)}
            canFollowUp={Boolean(onFollowUp)}
          />
        )}
        {safeAnswer.kind === "steps" && (
          <StepsAnswer
            answer={safeAnswer}
            onFollowUp={(context) => followUp(context)}
            canFollowUp={Boolean(onFollowUp)}
          />
        )}
      </div>
    </section>
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
          {points.map(({ label, x }, index) => (
            <text
              key={label + index}
              x={x}
              y={chart.y + chart.height + 22}
              textAnchor="middle"
              fill="#9aa2b1"
              fontSize="10"
            >
              {label.length > 14 ? label.slice(0, 13) + "…" : label}
            </text>
          ))}
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
  const result = useMemo(
    () => evaluateInteractiveFormula(answer.formula, values),
    [answer.formula, values],
  );

  const updateValue = (id: string, value: number) => {
    setValues((current) => ({ ...current, [id]: value }));
  };
  const context =
    answer.inputs.map((input) => input.label + " = " + values[input.id] + (input.suffix ?? "")).join(", ") +
    (result === undefined ? "" : ", " + answer.resultLabel + " = " + formatNumber(result) + (answer.resultSuffix ?? ""));

  return (
    <div>
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
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-violet-300/15 bg-violet-300/[0.045] px-3.5 py-3">
        <span className="text-[11px] font-medium text-[var(--color-text-dim)]">{answer.resultLabel}</span>
        <output aria-live="polite" className="text-[21px] font-medium tabular-nums tracking-tight text-white">
          {result === undefined ? "—" : formatNumber(result) + (answer.resultSuffix ?? "")}
        </output>
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
