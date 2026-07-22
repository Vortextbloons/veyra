import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { StudioResponseRevision } from "./studio-types";
import { buildStudioDocument } from "./studio-document-builder";

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "studio-response";
}

export async function exportStudioRevisionToFile(revision: StudioResponseRevision): Promise<string | null> {
  const document = buildStudioDocument({ ...revision, reducedMotion: true });
  const path = await save({
    defaultPath: `${sanitizeFileName(revision.title)}.html`,
    filters: [{ name: "HTML document", extensions: ["html"] }],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, contents: document });
  return path;
}
