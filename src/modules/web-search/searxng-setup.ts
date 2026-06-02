import { invoke } from "@tauri-apps/api/core";

export type SearxngSetupStatus = {
  docker_installed: boolean;
  container_exists: boolean;
  container_running: boolean;
  searxng_url: string;
};

export async function invokeCheckSearxngSetup(): Promise<SearxngSetupStatus> {
  return invoke<SearxngSetupStatus>("check_searxng_setup");
}

export async function invokeStartSearxngContainer(): Promise<string> {
  return invoke<string>("start_searxng_container");
}

export async function invokeStopSearxngContainer(): Promise<void> {
  return invoke<void>("stop_searxng_container");
}
