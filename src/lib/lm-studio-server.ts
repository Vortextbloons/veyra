import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@/lib/lm-studio-constants";

export async function isServerRunning(baseUrl?: string): Promise<boolean> {
  try {
    const url = `${baseUrl || DEFAULT_LM_STUDIO_BASE_URL}/v1/models`;
    const res = await tauriFetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startServer(baseUrl?: string): Promise<{ success: boolean; message: string }> {
  try {
    const endpoint = await invoke<string>("start_lm_studio_server", {
      baseUrl: baseUrl?.trim() || null,
    });
    return { success: true, message: `Server ready at ${endpoint}` };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to start LM Studio server",
    };
  }
}

export async function ensureServerRunning(baseUrl?: string): Promise<boolean> {
  const url = baseUrl?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
  if (await isServerRunning(url)) return true;

  const result = await startServer(url);
  if (!result.success) {
    console.error("[LM Studio]", result.message);
    return false;
  }

  return isServerRunning(url);
}
