import { invoke } from "@tauri-apps/api/core";

export type SearxngSetupStatus = {
  docker_installed: boolean;
  docker_daemon_running: boolean;
  container_exists: boolean;
  container_running: boolean;
  searxng_url: string;
};

export class SearxngDockerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearxngDockerError";
  }
}

function toSearxngDockerError(err: unknown): SearxngDockerError {
  if (err instanceof SearxngDockerError) return err;
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err);
  return new SearxngDockerError(message);
}

export async function invokeCheckSearxngSetup(): Promise<SearxngSetupStatus> {
  try {
    return await invoke<SearxngSetupStatus>("check_searxng_setup");
  } catch (err) {
    throw toSearxngDockerError(err);
  }
}

export async function invokeStartSearxngContainer(): Promise<string> {
  try {
    return await invoke<string>("start_searxng_container");
  } catch (err) {
    throw toSearxngDockerError(err);
  }
}

export async function invokeStopSearxngContainer(): Promise<void> {
  try {
    await invoke<void>("stop_searxng_container");
  } catch (err) {
    throw toSearxngDockerError(err);
  }
}

/**
 * Auto-configure SearXNG via Docker when the binary and daemon are available.
 * Throws {@link SearxngDockerError} when Docker is installed but setup fails.
 * No-ops when Docker is not installed (manual URL configuration).
 */
export async function runSearxngAutoSetup(): Promise<void> {
  const status = await invokeCheckSearxngSetup();

  if (status.container_running && status.searxng_url) {
    return;
  }

  if (!status.docker_installed) {
    return;
  }

  // Rust starts Docker Desktop and waits for the daemon when needed.
  await invokeStartSearxngContainer();
}
