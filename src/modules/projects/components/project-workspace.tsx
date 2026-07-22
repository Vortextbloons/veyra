import { useMemo, useState } from "react";
import {
  Folder,
  MessageSquare,
  FileText,
  BookOpen,
  Clock,
} from "lucide-react";
import type { ProjectRecord } from "@/modules/projects/project-types";
import { PROJECT_KIND_LABELS } from "@/modules/projects/project-types";
import { useProjectStore } from "@/modules/projects/project-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { resolveConversationExperience } from "@/modules/chat/studio/studio-normalize";
import { ProjectSettingsPanel } from "./project-settings-panel";
import { ProjectExportPanel } from "./project-export-panel";

function StudioListBadge() {
  return (
    <span
      className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-violet-200"
      aria-label="Studio conversation"
    >
      Studio
    </span>
  );
}

type Tab = "overview" | "chats" | "documents" | "memory" | "instructions" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chats", label: "Chats" },
  { id: "documents", label: "Documents" },
  { id: "memory", label: "Memory" },
  { id: "instructions", label: "Instructions" },
  { id: "settings", label: "Settings" },
];

export function ProjectWorkspace({ project }: { project: ProjectRecord }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* Project header */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)]">
            <Folder className="size-4 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[14px] font-semibold text-[var(--color-text)]">
              {project.name}
            </h1>
            <p className="text-[11px] text-[var(--color-text-dim)]">
              {PROJECT_KIND_LABELS[project.kind]}
              {project.description ? ` · ${project.description}` : ""}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-2.5 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {activeTab === "overview" && <OverviewTab project={project} />}
        {activeTab === "chats" && <ChatsTab project={project} />}
        {activeTab === "documents" && <DocumentsTab project={project} />}
        {activeTab === "memory" && <MemoryTab project={project} />}
        {activeTab === "instructions" && <InstructionsTab project={project} />}
        {activeTab === "settings" && <SettingsTab project={project} />}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: ProjectRecord }) {
  const conversations = useChatStore((s) => s.conversations);
  const documents = useDocumentStore((s) => s.documents);

  const projectChats = useMemo(
    () => conversations.filter((c) => c.projectId === project.id),
    [conversations, project.id],
  );
  const projectDocs = useMemo(
    () => documents.filter((d) => d.projectId === project.id),
    [documents, project.id],
  );

  const lastActivity = projectChats.length > 0
    ? new Date(Math.max(...projectChats.map((c) => c.updatedAt))).toLocaleDateString()
    : project.updatedAt
      ? new Date(project.updatedAt).toLocaleDateString()
      : "—";

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      {/* Stats */}
      <div className="grid w-full grid-cols-4 gap-3">
        <StatCard label="Chats" value={projectChats.length} />
        <StatCard label="Documents" value={projectDocs.length} />
        <StatCard label="Memory" value="—" />
        <StatCard label="Last activity" value={lastActivity} isDate />
      </div>

      {/* Quick info */}
      <div className="grid w-full grid-cols-2 gap-4">
        <InfoCard title="Project type" value={PROJECT_KIND_LABELS[project.kind]} />
        <InfoCard title="Status" value={project.status} />
        <InfoCard
          title="System prompt"
          value={project.systemPrompt ? `${project.systemPrompt.slice(0, 80)}...` : "Not set"}
        />
        <InfoCard
          title="Memory"
          value={project.settings?.memoryEnabled !== false ? "Enabled" : "Disabled"}
        />
      </div>

      {/* Recent chats — fills remaining space */}
      <div className="flex w-full flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <h3 className="mb-3 text-[12.5px] font-medium text-[var(--color-text)]">Recent Chats</h3>
        {projectChats.length === 0 ? (
          <p className="text-center text-[12px] text-[var(--color-text-dim)]">No chats yet</p>
        ) : (
          <div className="w-full flex-1 space-y-1">
            {projectChats.map((chat) => (
              <div key={chat.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
                  {chat.title}
                </span>
                {resolveConversationExperience(chat) === "studio" && <StudioListBadge />}
                <span className="text-[10px] text-[var(--color-text-dim)]">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatsTab({ project }: { project: ProjectRecord }) {
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);

  const projectChats = useMemo(
    () => conversations.filter((c) => c.projectId === project.id),
    [conversations, project.id],
  );

  const handleNewChat = () => {
    createConversation(project.id, { experience: "standard" });
    setActiveNav("chat");
  };

  const handleChatSelect = (id: string) => {
    setActiveConversationId(id);
    setActiveNav("chat");
  };

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[var(--color-text)]">
          Project Chats ({projectChats.length})
        </h3>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
        >
          New Chat
        </button>
      </div>

      {projectChats.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No chats yet"
          description="Start a conversation in this project."
          action={{ label: "New Chat", onClick: handleNewChat }}
        />
      ) : (
        <div className="w-full flex-1 space-y-1">
          {projectChats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => handleChatSelect(chat.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-left transition-colors hover:border-white/20"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
                    {chat.title}
                  </div>
                  {resolveConversationExperience(chat) === "studio" && <StudioListBadge />}
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  {chat.messages.length} messages
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                <Clock className="size-3" />
                {new Date(chat.updatedAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ project }: { project: ProjectRecord }) {
  const documents = useDocumentStore((s) => s.documents);
  const projectDocs = useMemo(
    () => documents.filter((d) => d.projectId === project.id),
    [documents, project.id],
  );

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[var(--color-text)]">
          Project Documents ({projectDocs.length})
        </h3>
      </div>

      {projectDocs.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No documents yet"
          description="Documents created in this project's chats will appear here."
        />
      ) : (
        <div className="w-full flex-1 space-y-1">
          {projectDocs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
                  {doc.title}
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  {doc.type} · {doc.status}
                </div>
              </div>
              <div className="text-[10px] text-[var(--color-text-dim)]">
                {new Date(doc.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryTab({ project }: { project: ProjectRecord }) {
  const memoryEnabled = project.settings?.memoryEnabled !== false;
  const memoryMode = project.settings?.memoryMode ?? "global default";

  return (
    <div className="flex h-full w-full flex-col p-4">
      <h3 className="mb-3 text-[13px] font-medium text-[var(--color-text)]">Project Memory</h3>

      <div className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Status
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--color-text)]">
            {memoryEnabled ? "Enabled" : "Disabled"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Mode
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--color-text)]">
            {memoryMode}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px] text-[var(--color-text-dim)]">
        Memories extracted from project chats are automatically scoped to this project.
        They are used when the project is active to provide relevant context.
      </p>
    </div>
  );
}

function InstructionsTab({ project }: { project: ProjectRecord }) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.systemPrompt ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject(project.id, { systemPrompt: draft });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[var(--color-text)]">System Prompt</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(project.systemPrompt ?? "");
              setEditing(true);
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
          >
            Edit
          </button>
        )}
      </div>

      <p className="mb-3 text-[12px] text-[var(--color-text-dim)]">
        These instructions are prepended to the AI system prompt when working in this project.
        Use them to define the AI's role, tone, or focus area for this project.
      </p>

      {editing ? (
        <div className="w-full">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
            placeholder="Enter project-level instructions for the AI..."
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
            {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-4 py-2 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : project.systemPrompt ? (
        <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
            {project.systemPrompt}
          </pre>
        </div>
      ) : (
        <div className="w-full rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <BookOpen className="mx-auto mb-2 size-8 text-[var(--color-text-dim)]" />
          <p className="text-[13px] text-[var(--color-text-dim)]">No system prompt set</p>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            Click Edit to add project-level instructions.
          </p>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ project }: { project: ProjectRecord }) {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <ProjectSettingsPanel project={project} />
      <ProjectExportPanel project={project} />
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  isDate = false,
}: {
  label: string;
  value: number | string;
  isDate?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </div>
      <div className={`mt-1 ${isDate ? "text-[13px]" : "text-[20px] font-semibold"} text-[var(--color-text)]`}>
        {value}
      </div>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
        {title}
      </div>
      <div className="mt-1 text-[13px] text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="w-full rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
      <div className="mx-auto mb-2 text-[var(--color-text-dim)]">{icon}</div>
      <p className="text-[13px] font-medium text-[var(--color-text)]">{title}</p>
      <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[12px] font-medium text-white hover:brightness-110"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
