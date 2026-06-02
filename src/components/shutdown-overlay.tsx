import { Check, Loader2 } from "lucide-react";
import { useShutdownState } from "@/hooks/use-shutdown-state";

const STEP_ORDER = [
  "preparing",
  "saving",
  "unloading_models",
  "stopping_search",
] as const;

export function ShutdownOverlay() {
  const { active, step, label, steps } = useShutdownState();

  if (!active) return null;

  const currentIndex = STEP_ORDER.indexOf(
    step as (typeof STEP_ORDER)[number],
  );

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="shutdown-title"
      aria-describedby="shutdown-description"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]/85 backdrop-blur-md"
    >
      <div className="mx-6 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 shadow-2xl shadow-black/50">
        <div className="mb-5 flex justify-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/20 ring-1 ring-inset ring-indigo-400/20">
            <Loader2 className="size-6 animate-spin text-indigo-300" />
          </div>
        </div>

        <h2
          id="shutdown-title"
          className="text-center text-[16px] font-semibold tracking-tight text-white"
        >
          Closing Veyra
        </h2>
        <p
          id="shutdown-description"
          className="mt-1.5 text-center text-[13px] text-[var(--color-text-dim)]"
        >
          {label}
        </p>

        <ul className="mt-5 space-y-2">
          {steps.map((item, index) => {
            const done =
              currentIndex > index ||
              (step === "done" && index < steps.length);
            const current = item.id === step;
            return (
              <li
                key={item.id}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                  current
                    ? "bg-indigo-500/10 text-white"
                    : done
                      ? "text-[var(--color-text-dim)]"
                      : "text-[var(--color-text-dim)]/45"
                }`}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  {done ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : current ? (
                    <Loader2 className="size-3.5 animate-spin text-indigo-400" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current opacity-40" />
                  )}
                </span>
                <span className={done && !current ? "line-through opacity-70" : ""}>
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
