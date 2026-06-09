import { useState } from "react";
import { Download, FileJson, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { ProjectRecord } from "@/modules/projects/project-types";
import { useChatStore } from "@/stores/chat-store";

export function ProjectExportPanel({ project }: { project: ProjectRecord }) {
  const conversations = useChatStore((s) => s.conversations);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const projectChats = conversations.filter((c) => c.projectId === project.id);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(false);

    try {
      const path = await save({
        defaultPath: `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_export.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) {
        setExporting(false);
        return;
      }

      await invoke("export_project_manifest", {
        projectId: project.id,
        targetPath: path,
        chatIds: projectChats.map((c) => c.id),
        documentIds: [], // Will be populated when document filtering by project is wired
        memoryNodeIds: [], // Will be populated when memory filtering by project is wired
      });

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-[12.5px] font-medium text-[var(--color-text)]">Export / Backup</h3>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)]">
            <FileJson className="size-4 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-[var(--color-text)]">
              Export Project Bundle
            </p>
            <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
              Export project metadata, settings, and resource references as a JSON manifest.
              Includes {projectChats.length} chat{projectChats.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {exporting ? "Exporting..." : "Export"}
          </button>
          {success && (
            <span className="text-[11px] text-emerald-400">Exported successfully</span>
          )}
          {error && <span className="text-[11px] text-red-400">{error}</span>}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-text-dim)]">
        The export includes project configuration, system prompt, and settings. Chat content
        references are included but full encrypted chat data remains in your local app data.
      </p>
    </div>
  );
}
