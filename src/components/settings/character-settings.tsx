import { useEffect, useState } from "react";
import { useCharacterStore } from "@/modules/characters/character-store";

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
