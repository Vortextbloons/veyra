import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryRecord } from "@/modules/memory/memory-types";

const memory = vi.hoisted(() => ({
  state: {
    enabled: false,
    records: [] as MemoryRecord[],
    loading: false,
    error: null as string | null,
    setEnabled: vi.fn(async () => {}),
    retrySave: vi.fn(async () => {}),
    initialize: vi.fn(async () => {}),
    addMemory: vi.fn(async () => {}),
    updateMemory: vi.fn(async () => {}),
    deleteMemory: vi.fn(async () => {}),
    clearMemories: vi.fn(async () => {}),
  },
}));

const projects = vi.hoisted(() => ({
  state: {
    projects: [
      { id: "proj-alpha", name: "Alpha Build", color: "violet", status: "active" },
    ],
    hydrateProjects: vi.fn(async () => {}),
  },
}));

vi.mock("@/modules/memory/memory-store", () => ({
  useMemoryStore: Object.assign(
    <T,>(selector: (state: typeof memory.state) => T) => selector(memory.state),
    { getState: () => memory.state },
  ),
}));

vi.mock("@/modules/projects/project-store", () => ({
  useProjectStore: <T,>(selector: (state: typeof projects.state) => T) =>
    selector(projects.state),
}));

import { MemorySettings } from "@/modules/memory/components/memory-settings";

function record(overrides: Partial<MemoryRecord> & { id: string }): MemoryRecord {
  return {
    text: "Prefers terse commit messages.",
    sourceType: "chat",
    sourceId: "chat-1",
    turnId: "turn-1",
    createdAt: Date.UTC(2026, 0, 1),
    updatedAt: Date.UTC(2026, 0, 1),
    ...overrides,
  };
}

function resetState() {
  memory.state.enabled = false;
  memory.state.records = [];
  memory.state.loading = false;
  memory.state.error = null;
}

describe("memory settings screen", () => {
  beforeEach(resetState);

  it("explains that memory is off without claiming facts were deleted", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("Memory");
    expect(markup).toContain("no automatic recall and no automatic collection");
    expect(markup).toContain("stay encrypted on this device");
    expect(markup).toContain("encrypted on this device");
  });

  it("describes lexical recall honestly and never promises embeddings", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("keyword search");
    expect(markup).toContain("not a semantic model");
    expect(markup.toLowerCase()).not.toContain("embedding");
    expect(markup.toLowerCase()).not.toContain("vector");
  });

  it("does not claim the model is local or that nothing leaves the device", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).not.toContain("your local model");
    expect(markup).not.toContain("Nothing goes to a cloud service");
    // The provider that receives turn text for extraction is named explicitly.
    expect(markup).toContain("same provider and model");
    expect(markup).toContain("cloud provider");
    expect(markup).toContain("the provider you selected receives them");
  });

  it("never promises absolute secret safety and asks the user to review facts", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).not.toContain("secrets or raw logs are never stored");
    expect(markup).toContain("cannot guarantee nothing sensitive slips through");
    expect(markup).toContain("review the list and remove anything you");
  });

  it("states that no separate memory cloud service is involved", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("no Mem0 cloud service is involved");
    expect(markup).toContain("no separate memory service or account");
  });

  it("avoids secure-erasure claims when removing facts", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("Remove saved facts");
    expect(markup).not.toContain("permanently removes");
    expect(markup).not.toContain("cannot restore");
    expect(markup).toContain("including its own backup copy");
  });

  it("keeps the manual manager available while automatic memory is off", () => {
    memory.state.records = [record({ id: "p1" })];
    const markup = renderToStaticMarkup(<MemorySettings />);
    // JSX indentation inserts newlines, so compare on collapsed whitespace.
    const text = markup.replace(/\s+/g, " ");
    expect(text).toContain("works whether or not automatic memory is on");
    expect(markup).toContain('aria-label="Edit fact: Prefers terse commit messages."');
    expect(markup).toContain("Memory off — these facts are not used automatically");
    expect(markup).toContain("Add fact");
  });

  it("shows an empty state inviting the user to act", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("No memories yet");
    expect(markup).toContain("Add a fact above");
  });

  it("reflects the persisted switch state", () => {
    const off = renderToStaticMarkup(<MemorySettings />);
    expect(off).toContain('aria-checked="false"');

    memory.state.enabled = true;
    memory.state.records = [record({ id: "p1" })];
    const on = renderToStaticMarkup(<MemorySettings />);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("Prefers terse commit messages.");
  });

  it("disables the switch while the store is loading", () => {
    memory.state.loading = true;
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toMatch(/role="switch"[^>]*disabled/);
  });

  it("groups personal facts and project facts with provenance and timestamps", () => {
    memory.state.enabled = true;
    memory.state.records = [
      record({ id: "p1", text: "Works in PowerShell on Windows." }),
      record({
        id: "a1",
        text: "The Alpha build uses Zustand.",
        projectId: "proj-alpha",
        sourceType: "agent",
        sourceId: "agent-7",
        turnId: "turn-42",
      }),
    ];
    const markup = renderToStaticMarkup(<MemorySettings />);

    expect(markup).toContain("Personal");
    expect(markup).toContain("Recalled in every chat and agent run");
    expect(markup).toContain("Alpha Build");
    expect(markup).toContain("Recalled only inside Alpha Build");
    expect(markup).toContain("Agent run");
    expect(markup).toContain("agent-7");
    expect(markup).toContain("turn turn-42");
    // Timestamps are localized, so assert the machine-readable value instead of a rendered label.
    expect(markup).toContain('dateTime="2026-01-01T00:00:00.000Z"');
    expect(markup).toContain("saved ");
    expect(markup).toContain("1 personal");
  });

  it("labels hand-added facts without fake conversation provenance", () => {
    memory.state.enabled = true;
    memory.state.records = [
      record({ id: "m1", sourceId: "manual", turnId: "manual-turn", text: "Uses pnpm." }),
    ];
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("Added by you");
    expect(markup).not.toContain("manual-turn");
    expect(markup).not.toContain("Source id: manual");
  });

  it("surfaces a storage failure with a single retry action", () => {
    memory.state.enabled = false;
    memory.state.error = "Veyra could not read or save encrypted memory storage.";
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("Memory storage problem");
    expect(markup).toContain("Try again");
    expect(markup.match(/Try again/g)).toHaveLength(1);
    expect(markup).toContain("encrypted memory storage");
  });

  it("marks the list busy while loading", () => {
    memory.state.loading = true;
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading saved facts");
  });

  it("offers scoped bulk removal with a concrete count", () => {
    memory.state.enabled = true;
    memory.state.records = [
      record({ id: "p1" }),
      record({ id: "a1", projectId: "proj-alpha" }),
      record({ id: "a2", projectId: "proj-alpha" }),
    ];
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("All memories (3)");
    expect(markup).toContain("Alpha Build (2)");
    expect(markup).toContain("Conversations, projects, and chat summaries are not affected");
  });

  it("disables bulk removal when nothing is stored", () => {
    const markup = renderToStaticMarkup(<MemorySettings />);
    expect(markup).toContain("All memories (0)");
    expect(markup).toMatch(/disabled[^>]*>\s*Remove/);
  });
});
