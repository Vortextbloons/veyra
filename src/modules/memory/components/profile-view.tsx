import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  MessageSquare,
  GraduationCap,
  Heart,
  Briefcase,
  BookOpen,
  Sliders,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import { useMemoryStore } from "@/modules/memory/memory-store";
import type { CreateMemoryNode, MemoryNode } from "@/modules/memory/memory-types";
import {
  PROFILE_CATEGORIES,
  type ProfileCategory,
} from "@/modules/memory/profile-config";
import {
  calculateProfileCompleteness,
  profileNodeForQuestion,
  buildProfileNodePayload,
} from "@/modules/memory/profile-helpers";

const ICON_MAP: Record<string, typeof User> = {
  User,
  MessageSquare,
  GraduationCap,
  Heart,
  Briefcase,
  BookOpen,
  Sliders,
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProfileView() {
  const nodes = useMemoryStore((s) => s.nodes);
  const createNode = useMemoryStore((s) => s.createNode);
  const updateNode = useMemoryStore((s) => s.updateNode);
  const archiveNode = useMemoryStore((s) => s.archiveNode);
  const folders = useMemoryStore((s) => s.folders);

  const defaultFolderId = useMemo(() => folders[0]?.id ?? "default", [folders]);
  const completeness = useMemo(() => calculateProfileCompleteness(nodes), [nodes]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto w-full px-6 py-6">
        <div className="mb-6">
          <div className="mb-1 text-[13px] font-semibold text-white">
            Tell the AI about yourself
          </div>
          <p className="text-[12px] text-[var(--color-text-dim)]">
            Answer a few questions to help it tailor responses to you. You can
            update these anytime.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
              {completeness}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {PROFILE_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              nodes={nodes}
              defaultFolderId={defaultFolderId}
              createNode={createNode}
              updateNode={updateNode}
              archiveNode={archiveNode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  nodes,
  defaultFolderId,
  createNode,
  updateNode,
  archiveNode,
}: {
  category: ProfileCategory;
  nodes: MemoryNode[];
  defaultFolderId: string;
  createNode: (input: Omit<CreateMemoryNode, "id"> & { id?: string }) => Promise<void>;
  updateNode: (input: { id: string; title?: string; content?: string; summary?: string; tags?: string[] }) => Promise<void>;
  archiveNode: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = ICON_MAP[category.icon] ?? User;

  const answeredCount = category.questions.filter((_, i) =>
    profileNodeForQuestion(nodes, category.id, i),
  ).length;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="grid size-7 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
          <Icon className="size-3.5 text-[var(--color-text-dim)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium text-white">
            {category.label}
          </div>
          <div className="text-[11px] text-[var(--color-text-dim)]">
            {category.description}
          </div>
        </div>
        <span className="mr-1 font-mono text-[10.5px] text-[var(--color-text-dim)]">
          {answeredCount}/{category.questions.length}
        </span>
        {expanded ? (
          <ChevronDown className="size-3.5 text-[var(--color-text-dim)]" />
        ) : (
          <ChevronRight className="size-3.5 text-[var(--color-text-dim)]" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-3">
          {category.questions.map((q, i) => (
            <QuestionField
              key={`${category.id}-${i}`}
              categoryId={category.id}
              questionIndex={i}
              question={q.question}
              placeholder={q.placeholder}
              nodes={nodes}
              defaultFolderId={defaultFolderId}
              createNode={createNode}
              updateNode={updateNode}
              archiveNode={archiveNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionField({
  categoryId,
  questionIndex,
  question,
  placeholder,
  nodes,
  defaultFolderId,
  createNode,
  updateNode,
  archiveNode,
}: {
  categoryId: string;
  questionIndex: number;
  question: string;
  placeholder: string;
  nodes: MemoryNode[];
  defaultFolderId: string;
  createNode: (input: Omit<CreateMemoryNode, "id"> & { id?: string }) => Promise<void>;
  updateNode: (input: { id: string; title?: string; content?: string; summary?: string; tags?: string[] }) => Promise<void>;
  archiveNode: (id: string) => Promise<void>;
}) {
  const existing = useMemo(
    () => profileNodeForQuestion(nodes, categoryId, questionIndex),
    [nodes, categoryId, questionIndex],
  );

  const [value, setValue] = useState(existing?.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(existing?.content ?? "");

  useEffect(() => {
    const node = profileNodeForQuestion(nodes, categoryId, questionIndex);
    const content = node?.content ?? "";
    if (content !== lastSavedRef.current) {
      setValue(content);
      lastSavedRef.current = content;
    }
  }, [nodes, categoryId, questionIndex]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const save = useCallback(
    async (answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed) {
        if (existing) {
          await archiveNode(existing.id);
          lastSavedRef.current = "";
        }
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
        return;
      }

      setSaveState("saving");
      try {
        const payload = buildProfileNodePayload(categoryId, questionIndex, trimmed);

        if (existing) {
          await updateNode({
            id: existing.id,
            title: payload.title,
            content: payload.content,
            summary: payload.summary,
            tags: payload.tags,
          });
        } else {
          await createNode({
            folderId: defaultFolderId,
            title: payload.title,
            content: payload.content,
            summary: payload.summary,
            type: "preference",
            scope: "global",
            tags: payload.tags,
            importance: 5,
            confidence: 1,
            priority: "permanent",
            origin: "profile_setup",
            status: "active",
            isPinned: true,
          });
        }
        lastSavedRef.current = trimmed;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 3000);
      }
    },
    [existing, categoryId, questionIndex, defaultFolderId, createNode, updateNode, archiveNode],
  );

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void save(next);
      }, 500);
    },
    [save],
  );

  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim() !== lastSavedRef.current) {
      void save(value);
    }
  }, [value, save]);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11.5px] text-[var(--color-text-dim)]">
        {question}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`h-8 w-full rounded-lg border bg-[var(--color-bg)] px-3 pr-8 text-[12.5px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:outline-none ${
            saveState === "error"
              ? "border-red-500/50 focus:border-red-500/70"
              : "border-[var(--color-border)] focus:border-[var(--color-accent)]/40"
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {saveState === "saving" && (
            <Loader2 className="size-3.5 animate-spin text-[var(--color-text-dim)]" />
          )}
          {saveState === "saved" && (
            <Check className="size-3.5 text-emerald-400" />
          )}
          {saveState === "error" && (
            <span className="text-[10px] text-red-400">retry</span>
          )}
        </div>
      </div>
    </div>
  );
}
