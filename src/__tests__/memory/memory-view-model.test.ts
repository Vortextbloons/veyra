import { describe, expect, it, vi } from "vitest";
import type { MemoryRecord } from "@/modules/memory/memory-types";
import {
  MAX_MEMORY_FACT_LENGTH,
  countMemoriesByScope,
  filterMemories,
  formatMemoryTimestamp,
  groupMemoriesByScope,
  memoryProvenance,
  projectScopeFilter,
  runMemoryRetry,
  shortIdentifier,
  sortMemoriesByNewest,
  wasMemoryEdited,
} from "@/modules/memory/components/memory-view-model";

const JAN_1 = Date.UTC(2026, 0, 1);
const JAN_15 = Date.UTC(2026, 0, 15);
const FEB_2 = Date.UTC(2026, 1, 2);
const MAR_3 = Date.UTC(2026, 2, 3);

function record(overrides: Partial<MemoryRecord> & { id: string }): MemoryRecord {
  return {
    text: "Prefers terse commit messages.",
    sourceType: "chat",
    sourceId: "chat-1",
    turnId: "turn-1",
    createdAt: JAN_1,
    updatedAt: JAN_1,
    ...overrides,
  };
}

const personal = record({ id: "p1", text: "Works in PowerShell on Windows." });
const alpha = record({
  id: "a1",
  text: "The Alpha project uses Zustand.",
  projectId: "proj-alpha",
  createdAt: FEB_2,
  updatedAt: FEB_2,
});
const alphaSecond = record({
  id: "a2",
  text: "The Alpha project keeps memory local.",
  projectId: "proj-alpha",
  sourceType: "agent",
  sourceId: "agent-9",
  turnId: "turn-9",
  createdAt: MAR_3,
  updatedAt: MAR_3,
});
const beta = record({
  id: "b1",
  text: "Client beta prefers weekly demos.",
  projectId: "proj-beta",
  createdAt: JAN_15,
  updatedAt: JAN_15,
});

const all = [personal, alpha, alphaSecond, beta];

const lookup = (id: string) =>
  id === "proj-alpha"
    ? { name: "Alpha Build", color: "violet" }
    : id === "proj-beta"
      ? { name: "Beta Client", color: "amber" }
      : undefined;

const nameOf = (id: string) => lookup(id)?.name ?? `Project ${id}`;

describe("memory scope counting", () => {
  it("separates personal facts from per-project facts", () => {
    const counts = countMemoriesByScope(all);
    expect(counts.total).toBe(4);
    expect(counts.personal).toBe(1);
    expect(counts.byProject.get("proj-alpha")).toBe(2);
    expect(counts.byProject.get("proj-beta")).toBe(1);
  });

  it("reports zeroes for an empty store", () => {
    const counts = countMemoriesByScope([]);
    expect(counts).toEqual({ total: 0, personal: 0, byProject: new Map() });
  });
});

describe("sortMemoriesByNewest", () => {
  it("orders newest first without mutating the input", () => {
    const input = [personal, beta, alphaSecond, alpha];
    const sorted = sortMemoriesByNewest(input);
    expect(sorted.map((item) => item.id)).toEqual(["a2", "a1", "b1", "p1"]);
    expect(input.map((item) => item.id)).toEqual(["p1", "b1", "a2", "a1"]);
  });

  it("breaks timestamp ties by id so ordering is stable", () => {
    const one = record({ id: "zz", createdAt: JAN_1, updatedAt: JAN_1 });
    const two = record({ id: "aa", createdAt: JAN_1, updatedAt: JAN_1 });
    expect(sortMemoriesByNewest([one, two]).map((item) => item.id)).toEqual(["aa", "zz"]);
  });
});

describe("filterMemories", () => {
  it("keeps every fact when the scope is All and the query is blank", () => {
    expect(filterMemories(all, { filter: "all", query: "  ", projectName: nameOf })).toHaveLength(4);
  });

  it("limits results to personal facts", () => {
    const result = filterMemories(all, { filter: "personal", query: "", projectName: nameOf });
    expect(result.map((item) => item.id)).toEqual(["p1"]);
  });

  it("limits results to a single project", () => {
    const result = filterMemories(all, {
      filter: projectScopeFilter("proj-alpha"),
      query: "",
      projectName: nameOf,
    });
    expect(result.map((item) => item.id).sort()).toEqual(["a1", "a2"]);
  });

  it("searches fact text, provenance ids, and project names case-insensitively", () => {
    const byText = filterMemories(all, { filter: "all", query: "zustand", projectName: nameOf });
    expect(byText.map((item) => item.id)).toEqual(["a1"]);

    const bySource = filterMemories(all, { filter: "all", query: "AGENT-9", projectName: nameOf });
    expect(bySource.map((item) => item.id)).toEqual(["a2"]);

    const byProject = filterMemories(all, {
      filter: "all",
      query: "beta client",
      projectName: nameOf,
    });
    expect(byProject.map((item) => item.id)).toEqual(["b1"]);
  });

  it("returns nothing when scope and query cannot both match", () => {
    expect(
      filterMemories(all, { filter: "personal", query: "zustand", projectName: nameOf }),
    ).toEqual([]);
  });
});

describe("groupMemoriesByScope", () => {
  it("puts personal first and then sorts projects by name", () => {
    const groups = groupMemoriesByScope(all, lookup);
    expect(groups.map((group) => group.key)).toEqual([
      "personal",
      projectScopeFilter("proj-alpha"),
      projectScopeFilter("proj-beta"),
    ]);
    expect(groups[0].label).toBe("Personal");
    expect(groups[1].label).toBe("Alpha Build");
    expect(groups[1].description).toBe("Recalled only inside Alpha Build");
    expect(groups[1].records).toHaveLength(2);
  });

  it("reuses the project color for the scope rail", () => {
    const groups = groupMemoriesByScope(all, lookup);
    expect(groups[1].railClass).toBe("bg-violet-400/80");
    expect(groups[2].railClass).toBe("bg-amber-400/80");
  });

  it("omits the personal section when only project facts survive filtering", () => {
    const groups = groupMemoriesByScope([alpha], lookup);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(projectScopeFilter("proj-alpha"));
  });

  it("falls back to a readable label and neutral rail for unknown projects", () => {
    const orphan = record({ id: "o1", projectId: "proj-deleted" });
    const [group] = groupMemoriesByScope([orphan], lookup);
    expect(group.label).toBe("Project proj-deleted");
    expect(group.railClass).toBe("bg-[var(--color-border-strong)]");
    expect(group.description).toBe("Recalled only inside Project proj-deleted");
  });

  it("shortens long unknown project ids in the fallback label", () => {
    const orphan = record({ id: "o1", projectId: "11111111-2222-3333-4444-555555555555" });
    const [group] = groupMemoriesByScope([orphan], lookup);
    expect(group.label).toBe("Project 11111111…");
  });

  it("returns no groups for an empty list", () => {
    expect(groupMemoriesByScope([], lookup)).toEqual([]);
  });
});

describe("presentation formatting", () => {
  it("shortens long ids and keeps short ones intact", () => {
    expect(shortIdentifier("abc")).toBe("abc");
    expect(shortIdentifier("0123456789abcdef")).toBe("01234567…");
    expect(shortIdentifier("")).toBe("unknown");
  });

  it("formats epoch millisecond timestamps and rejects bad input", () => {
    expect(formatMemoryTimestamp(Number.NaN)).toBe("Unknown time");
    expect(formatMemoryTimestamp(Number.POSITIVE_INFINITY)).toBe("Unknown time");
    expect(formatMemoryTimestamp(JAN_1)).not.toBe("Unknown time");
  });

  it("detects an edited fact without flagging untouched ones", () => {
    expect(wasMemoryEdited(record({ id: "same" }))).toBe(false);
    expect(wasMemoryEdited(record({ id: "touched", updatedAt: JAN_15 }))).toBe(true);
  });

  it("matches the encrypted store's per-fact character limit", () => {
    expect(MAX_MEMORY_FACT_LENGTH).toBe(500);
  });
});

describe("memoryProvenance", () => {
  it("marks hand-added facts as user actions without turn provenance", () => {
    const manual = record({ id: "m1", sourceId: "manual", turnId: "generated-turn" });
    expect(memoryProvenance(manual)).toEqual({ label: "Added by you", showIdentifiers: false });
  });

  it("keeps chat and agent provenance with identifiers for extracted facts", () => {
    expect(memoryProvenance(record({ id: "c1" }))).toEqual({
      label: "Chat",
      showIdentifiers: true,
    });
    expect(memoryProvenance(record({ id: "a1", sourceType: "agent" }))).toEqual({
      label: "Agent run",
      showIdentifiers: true,
    });
  });
});

describe("runMemoryRetry", () => {
  it("stops after a successful reload instead of rewriting storage", async () => {
    const initialize = vi.fn(async () => {});
    const retrySave = vi.fn(async () => {});
    await expect(
      runMemoryRetry({ initialize, retrySave, readError: () => null }),
    ).resolves.toBe("loaded");
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(retrySave).not.toHaveBeenCalled();
  });

  it("re-attempts the save only when a problem survives the reload", async () => {
    const calls: string[] = [];
    const initialize = vi.fn(async () => {
      calls.push("initialize");
    });
    const retrySave = vi.fn(async () => {
      calls.push("retrySave");
    });
    await expect(
      runMemoryRetry({ initialize, retrySave, readError: () => "save failed" }),
    ).resolves.toBe("saved");
    expect(calls).toEqual(["initialize", "retrySave"]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(retrySave).toHaveBeenCalledTimes(1);
  });

  it("propagates a reload failure so the caller can report it", async () => {
    const initialize = vi.fn(async () => {
      throw new Error("still unreadable");
    });
    const retrySave = vi.fn(async () => {});
    await expect(
      runMemoryRetry({ initialize, retrySave, readError: () => "unreadable" }),
    ).rejects.toThrow("still unreadable");
    expect(retrySave).not.toHaveBeenCalled();
  });
});
