import { useEffect, useState } from "react";
import { useCharacterStore } from "@/modules/characters/character-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "@/components/settings/model-dropdown";
import { CHARACTER_TONE_PRESETS } from "@/modules/characters/ai-assist/tones";
import { useCharacterAssistStore } from "@/modules/characters/ai-assist/ai-assist-store";


const SCAN_DEPTH_OPTIONS = [
  { id: "last_user", label: "Last user message", description: "Trigger on keywords in the most recent user message only." },
  { id: "last_3", label: "Last 3 messages", description: "Scan the last few exchanges for matches." },
  { id: "last_5", label: "Last 5 messages", description: "Scan a longer window for matches." },
  { id: "full_history", label: "Full history", description: "Scan the entire conversation. Most flexible, most expensive." },
] as const;

type ScanDepth = (typeof SCAN_DEPTH_OPTIONS)[number]["id"];

const CHARACTER_LOREBOOK_BUDGET_KEY = "veyra.character.lorebookBudget";
const CHARACTER_SCAN_DEPTH_KEY = "veyra.character.scanDepth";
const CHARACTER_EXAMPLE_BUDGET_KEY = "veyra.character.exampleBudget";
const CHARACTER_BLOCK_BUDGET_KEY = "veyra.character.characterBlockBudget";

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function readString<T extends string>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return raw as T;
  } catch {
    return fallback;
  }
}

function writeString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function CharacterSettings() {
  const characters = useCharacterStore((s) => s.characters);

  const [lorebookBudget, setLorebookBudget] = useState<number>(() =>
    readNumber(CHARACTER_LOREBOOK_BUDGET_KEY, 1500),
  );
  const [characterBlockBudget, setCharacterBlockBudget] = useState<number>(() =>
    readNumber(CHARACTER_BLOCK_BUDGET_KEY, 3000),
  );
  const [exampleBudget, setExampleBudget] = useState<number>(() =>
    readNumber(CHARACTER_EXAMPLE_BUDGET_KEY, 1000),
  );
  const [scanDepth, setScanDepth] = useState<ScanDepth>(() =>
    readString<ScanDepth>(CHARACTER_SCAN_DEPTH_KEY, "last_user"),
  );

  useEffect(() => writeNumber(CHARACTER_LOREBOOK_BUDGET_KEY, lorebookBudget), [lorebookBudget]);
  useEffect(
    () => writeNumber(CHARACTER_BLOCK_BUDGET_KEY, characterBlockBudget),
    [characterBlockBudget],
  );
  useEffect(() => writeNumber(CHARACTER_EXAMPLE_BUDGET_KEY, exampleBudget), [exampleBudget]);
  useEffect(() => writeString(CHARACTER_SCAN_DEPTH_KEY, scanDepth), [scanDepth]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <header className="mb-3">
          <h2 className="text-[14px] font-semibold text-white">Characters</h2>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-dim)]">
            Manage the roleplay character library. {characters.length} character
            {characters.length === 1 ? "" : "s"} currently loaded.
          </p>
        </header>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <h3 className="text-[12.5px] font-medium text-white">Open Characters</h3>
          <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
            Switch to the <span className="font-medium text-white">Characters</span> page
            in the primary sidebar to create, edit, and organize your character cards,
            manage lorebook entries, and import or export CCv3 cards.
          </p>
        </div>
      </section>

      <CharacterAssistSettings />

      <section>
        <header className="mb-3">
          <h2 className="text-[14px] font-semibold text-white">Context Budgets</h2>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-dim)]">
            Reserve token budgets for character content during chat. These caps apply per
            active character; excess content is dropped before reaching the model.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <BudgetSlider
            label="Character block budget"
            description="Maximum tokens for the character's description, personality, and scenario."
            value={characterBlockBudget}
            min={500}
            max={8000}
            step={250}
            onChange={setCharacterBlockBudget}
          />
          <BudgetSlider
            label="Lorebook budget"
            description="Maximum tokens for keyword-triggered lorebook entries per turn."
            value={lorebookBudget}
            min={250}
            max={6000}
            step={250}
            onChange={setLorebookBudget}
          />
          <BudgetSlider
            label="Example messages budget"
            description="Maximum tokens reserved for few-shot example dialogues."
            value={exampleBudget}
            min={0}
            max={4000}
            step={250}
            onChange={setExampleBudget}
          />
        </div>
      </section>

      <section>
        <header className="mb-3">
          <h2 className="text-[14px] font-semibold text-white">Lorebook Triggering</h2>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-dim)]">
            Choose how much of the conversation the lorebook engine scans to decide which
            keyword entries fire. Always-on (constant) entries are not affected.
          </p>
        </header>

        <div className="flex flex-col gap-2">
          {SCAN_DEPTH_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                scanDepth === opt.id
                  ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              <input
                type="radio"
                name="scan-depth"
                value={opt.id}
                checked={scanDepth === opt.id}
                onChange={() => setScanDepth(opt.id)}
                className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
              />
              <div>
                <div className="text-[12.5px] font-medium text-white">{opt.label}</div>
                <div className="text-[11.5px] text-[var(--color-text-dim)]">
                  {opt.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function CharacterAssistSettings() {
  const models = useProviderStore((s) => s.models);
  const characterAssistModel = useSettingsStore((s) => s.characterAssistModel);
  const setCharacterAssistModel = useSettingsStore((s) => s.setCharacterAssistModel);
  const characterAssistMaxTokens = useSettingsStore((s) => s.characterAssistMaxTokens);
  const setCharacterAssistMaxTokens = useSettingsStore((s) => s.setCharacterAssistMaxTokens);
  const characterAssistSendContext = useSettingsStore((s) => s.characterAssistSendContext);
  const setCharacterAssistSendContext = useSettingsStore((s) => s.setCharacterAssistSendContext);
  const characterAssistTelemetry = useSettingsStore((s) => s.characterAssistTelemetry);
  const setCharacterAssistTelemetry = useSettingsStore((s) => s.setCharacterAssistTelemetry);
  const characterAssistTone = useSettingsStore((s) => s.characterAssistTone);
  const setCharacterAssistTone = useSettingsStore((s) => s.setCharacterAssistTone);
  const telemetryLog = useCharacterAssistStore((s) => s.telemetryLog);
  const clearTelemetry = useCharacterAssistStore((s) => s.clearTelemetry);
  const [showLog, setShowLog] = useState(false);

  const reset = () => {
    if (
      !window.confirm(
        "Reset all character AI assist settings to their defaults? This won't affect your characters or telemetry log.",
      )
    ) {
      return;
    }
    setCharacterAssistModel("");
    setCharacterAssistMaxTokens(1500);
    setCharacterAssistSendContext(false);
    setCharacterAssistTelemetry(true);
    setCharacterAssistTone("neutral");
  };

  return (
    <section>
      <header className="mb-3">
        <h2 className="text-[14px] font-semibold text-white">AI Assist</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-text-dim)]">
          Configure how the model helps you author and develop characters. The assist
          flow never writes to your database without an explicit Apply.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">Assist model</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Model used for character AI assist. Leave empty to use the currently
              selected model.
            </div>
          </div>
          <ModelDropdown
            models={models}
            value={characterAssistModel}
            onChange={setCharacterAssistModel}
            placeholder="Use selected model"
          />
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <div className="mb-2">
            <div className="text-[12.5px] font-medium text-white">Default tone</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              Tone preset for new assist actions. Per-action overrides are available in
              the assist popovers.
            </div>
          </div>
          <select
            value={characterAssistTone}
            onChange={(e) => setCharacterAssistTone(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          >
            {CHARACTER_TONE_PRESETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <div className="mb-1 flex items-baseline justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-white">Max output tokens</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Cap on the model's response per assist action.
              </div>
            </div>
            <div className="font-mono text-[12.5px] text-white">
              {characterAssistMaxTokens.toLocaleString()} <span className="text-[var(--color-text-dim)]">tok</span>
            </div>
          </div>
          <input
            type="range"
            min={256}
            max={4000}
            step={64}
            value={characterAssistMaxTokens}
            onChange={(e) => setCharacterAssistMaxTokens(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[10.5px] text-[var(--color-text-dim)]">
            <span>256</span>
            <span>4,000</span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12.5px] font-medium text-white">Send current character as context</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                When on, the assist request includes a summary of the active character
                record. Off by default for faster and tighter prompts.
              </div>
            </div>
            <Toggle
              on={characterAssistSendContext}
              onChange={setCharacterAssistSendContext}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12.5px] font-medium text-white">Local telemetry</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Record assist start/finish, duration, and outcome to a local log file
                (this device only). Never sent off the machine.
              </div>
            </div>
            <Toggle
              on={characterAssistTelemetry}
              onChange={setCharacterAssistTelemetry}
            />
          </div>
          {characterAssistTelemetry && (
            <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2">
              <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                <span className="text-[var(--color-text-dim)]">
                  {telemetryLog.events.length} event{telemetryLog.events.length === 1 ? "" : "s"} recorded.
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowLog((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  >
                    {showLog ? "Hide" : "View"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Clear the local telemetry log?")) {
                        clearTelemetry();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/20"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {showLog && (
                <TelemetryLogList events={telemetryLog.events} />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </section>
  );
}

function TelemetryLogList({
  events,
}: {
  events: ReturnType<typeof useCharacterAssistStore.getState>["telemetryLog"]["events"];
}) {
  if (events.length === 0) {
    return (
      <p className="px-1 py-2 text-center text-[11px] text-[var(--color-text-dim)]">
        No events yet. Trigger an assist action on the Characters page.
      </p>
    );
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-[var(--color-bg)] text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          <tr>
            <th className="px-2 py-1 text-left">When</th>
            <th className="px-2 py-1 text-left">Action</th>
            <th className="px-2 py-1 text-left">Outcome</th>
            <th className="px-2 py-1 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t border-[var(--color-border)]">
              <td className="px-2 py-1 text-[var(--color-text-dim)]">
                {new Date(e.ts).toLocaleTimeString()}
              </td>
              <td className="px-2 py-1 text-white">{e.action}</td>
              <td className="px-2 py-1">
                <span
                  className={
                    e.outcome === "completed"
                      ? "text-emerald-300"
                      : e.outcome === "cancelled"
                        ? "text-amber-300"
                        : "text-red-300"
                  }
                >
                  {e.outcome}
                </span>
              </td>
              <td className="px-2 py-1 text-right font-mono text-[var(--color-text-dim)]">
                {e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BudgetSliderProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function BudgetSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: BudgetSliderProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[12.5px] font-medium text-white">{label}</div>
          <div className="text-[11.5px] text-[var(--color-text-dim)]">{description}</div>
        </div>
        <div className="font-mono text-[12.5px] text-white">
          {value.toLocaleString()} <span className="text-[var(--color-text-dim)]">tok</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-accent)]"
      />
      <div className="mt-1 flex justify-between text-[10.5px] text-[var(--color-text-dim)]">
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
