import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import { DialogSurface } from "@/components/dialog-surface";
import { useProjectStore } from "../project-store";
import type { ProjectRecord } from "../project-types";

const fieldClass = "mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none focus:border-[var(--color-accent)] disabled:opacity-50";

export function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (project: ProjectRecord) => void }) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  const chooseFolder = async () => {
    try {
      const path = await open({ directory: true, title: "Choose project folder" });
      if (typeof path === "string") {
        setFolder(path);
        setName((current) => current || path.split(/[\\/]/).filter(Boolean).pop() || "");
      }
    } catch (cause) { setError(String(cause)); }
  };
  return createPortal(<DialogSurface onClose={close} ariaLabel="Create project" panelClassName="w-[460px] max-w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-6 shadow-2xl">
    <h2 className="text-base font-semibold text-white">Create project</h2>
    <p className="mt-1 text-xs text-[var(--color-text-dim)]">Keep related chats, files, and instructions together.</p>
    <form className="mt-5 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (busy || !name.trim()) return;
      setBusy(true);
      setError("");
      const previous = useProjectStore.getState().activeProjectId;
      void useProjectStore.getState().createProject(name.trim(), {
        systemPrompt: instructions.trim(),
        settings: { resources: folder ? [{ path: folder, directory: true }] : [] },
      }).then((project) => {
        useProjectStore.getState().setActiveProjectId(previous);
        onCreated(project);
      }).catch((cause) => setError(String(cause))).finally(() => setBusy(false));
    }}>
      <label className="block text-xs text-[var(--color-text-dim)]">Project name<input required maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="e.g. Website redesign" className={fieldClass} /></label>
      <div><p className="text-xs text-[var(--color-text-dim)]">Folder <span className="opacity-60">(optional)</span></p><div className="mt-1.5 flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void chooseFolder()} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 text-left text-xs text-[var(--color-text-dim)] hover:bg-white/5"><FolderOpen size={15} className="shrink-0" /><span className="truncate" title={folder}>{folder || "Choose a folder"}</span></button>{folder && <button type="button" disabled={busy} onClick={() => setFolder("")} className="text-xs text-[var(--color-text-dim)] hover:text-white">Remove</button>}</div></div>
      <label className="block text-xs text-[var(--color-text-dim)]">Project instructions <span className="opacity-60">(optional)</span><textarea value={instructions} disabled={busy} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="What should the AI know for chats in this project?" className={fieldClass} /></label>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4"><button type="button" onClick={close} disabled={busy} className="rounded-lg px-3 py-2 text-xs text-[var(--color-text-dim)] hover:bg-white/5">Cancel</button><button type="submit" disabled={busy || !name.trim()} className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{busy ? "Creating..." : "Create project"}</button></div>
    </form>
  </DialogSurface>, document.body);
}
