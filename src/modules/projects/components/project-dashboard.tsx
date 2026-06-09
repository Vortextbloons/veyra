import { useState } from "react";
import {
  Folder,
  MessageSquare,
  FileText,
  Database,
  Plus,
  Clock,
  Pencil,
} from "lucide-react";
import { PROJECT_KIND_LABELS } from "@/modules/projects/project-types";
import { useProjectStore } from "@/modules/projects/project-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";

export function ProjectDashboard() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");

  if (!activeProject) return null;

  const projectChats = conversations.filter((c) => c.projectId === activeProject.id);

  const handleNewProjectChat = () => {
    createConversation(activeProject.id);
    setActiveNav("chat");
  };

  const handleChatSelect = (id: string) => {
    setActiveConversationId(id);
    setActiveNav("chat");
  };

  const handleStartEditPrompt = () => {
    setPromptDraft(activeProject.systemPrompt ?? "");
    setEditingPrompt(true);
  };

  const handleSavePrompt = async () => {
    await updateProject(activeProject.id, { systemPrompt: promptDraft });
    setEditingPrompt(false);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)]">
            <Folder className="size-5 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold text-[var(--color-text)]">
              {activeProject.name}
            </h1>
            <p className="text-[12px] text-[var(--color-text-dim)]">
              {PROJECT_KIND_LABELS[activeProject.kind]} · {activeProject.status}
            </p>
          </div>
        </div>
        {activeProject.description && (
          <p className="mt-2 text-[12px] text-[var(--color-text-dim)]">
            {activeProject.description}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 border-b border-[var(--color-border)] px-6 py-4">
        <StatCard icon={<MessageSquare className="size-4" />} label="Chats" value={projectChats.length} />
        <StatCard icon={<FileText className="size-4" />} label="Documents" value="—" />
        <StatCard icon={<Database className="size-4" />} label="Memories" value="—" />
      </div>

      {/* Sections */}
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {/* Chats */}
        <DashboardSection
          title="Project Chats"
          action={
            <button
              type="button"
              onClick={handleNewProjectChat}
              className="flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:brightness-110"
            >
              <Plus className="size-3" />
              New Chat
            </button>
          }
        >
          {projectChats.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-[var(--color-text-dim)]">
              No chats in this project yet
            </p>
          ) : (
            <div className="space-y-1">
              {projectChats.slice(0, 10).map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleChatSelect(chat.id)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-white/[0.03]"
                >
                  <MessageSquare className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
                    {chat.title}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)]">
                    <Clock className="size-3" />
                    {new Date(chat.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DashboardSection>

        {/* System Prompt */}
        <DashboardSection
          title="System Prompt"
          action={
            !editingPrompt ? (
              <button
                type="button"
                onClick={handleStartEditPrompt}
                className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)] hover:text-white"
              >
                <Pencil className="size-3" />
                Edit
              </button>
            ) : undefined
          }
        >
          {editingPrompt ? (
            <div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
                placeholder="Enter project-level instructions for the AI..."
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPrompt(false)}
                  className="rounded-md px-3 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : activeProject.systemPrompt ? (
            <p className="whitespace-pre-wrap text-[12px] text-[var(--color-text-dim)]">
              {activeProject.systemPrompt}
            </p>
          ) : (
            <p className="py-2 text-center text-[12px] text-[var(--color-text-dim)]">
              No project prompt set. Click Edit to add instructions.
            </p>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-[var(--color-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <div className="flex items-center gap-2 text-[var(--color-text-dim)]">
        {icon}
        <span className="text-[10.5px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 text-[18px] font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  );
}
