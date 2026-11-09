import { useEffect, useState } from "react";
import { checkBashAvailable, type BashAvailability } from "./shell-availability";

/**
 * Caches the Bash probe for the session.
 *
 * Discovery only changes when the user installs or removes a shell, so one
 * check per app session is enough. A failed probe stays reported rather than
 * being retried on every render.
 */
let cached: BashAvailability | null = null;
let inFlight: Promise<BashAvailability> | null = null;

function probe(): Promise<BashAvailability> {
  inFlight ??= checkBashAvailable().then((result) => {
    cached = result;
    inFlight = null;
    return result;
  });
  return inFlight;
}

export function useBashAvailability(enabled: boolean): BashAvailability | null {
  const [availability, setAvailability] = useState<BashAvailability | null>(cached);

  useEffect(() => {
    if (!enabled || cached) return;
    let cancelled = false;
    // Resolution happens in a microtask, never synchronously in the effect.
    void probe().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  return enabled ? availability : null;
}

/** Test seam: forgets the cached probe. */
export function resetBashAvailabilityCache(): void {
  cached = null;
  inFlight = null;
}
