import { invoke } from "@tauri-apps/api/core";

export type BashAvailability = {
  available: boolean;
  shellPath: string | null;
  message: string | null;
  searched: string[];
};

/**
 * Whether the bundled Bash tool can actually run.
 *
 * Pi resolves Bash itself when a command executes; this mirrors the same search
 * so the interface can show an actionable message before a turn is wasted. A
 * failed probe is reported as unavailable rather than as a silent success.
 */
export async function checkBashAvailable(): Promise<BashAvailability> {
  try {
    return await invoke<BashAvailability>("check_bash_available");
  } catch (error) {
    return {
      available: false,
      shellPath: null,
      message: `Could not check for Bash: ${error instanceof Error ? error.message : String(error)}`,
      searched: [],
    };
  }
}
