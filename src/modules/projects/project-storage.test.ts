import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  newId: vi.fn(),
  nowIso: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@/lib/id", () => ({
  newId: mocks.newId,
  nowIso: mocks.nowIso,
}));

import { createProject, deleteProject, updateProject } from "./project-storage";

describe("project-storage", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.newId.mockReset();
    mocks.nowIso.mockReset();
    mocks.newId.mockReturnValue("proj-123");
    mocks.nowIso.mockReturnValue("2026-06-18T12:00:00.000Z");
  });

  it("serializes createProject payloads with defaults", async () => {
    mocks.invoke.mockResolvedValue({ id: "proj-123" });

    await createProject({
      name: "New Project",
      settings: { memoryEnabled: true },
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "create_project",
      expect.objectContaining({
        input: expect.any(String),
      }),
    );

    const payload = JSON.parse(mocks.invoke.mock.calls[0][1].input as string) as Record<string, unknown>;
    expect(payload).toEqual({
      id: "proj-123",
      name: "New Project",
      description: "",
      kind: "general",
      status: "active",
      color: "indigo",
      icon: "folder",
      systemPrompt: "",
      settingsJson: '{"memoryEnabled":true}',
      createdAt: "2026-06-18T12:00:00.000Z",
      updatedAt: "2026-06-18T12:00:00.000Z",
    });
  });

  it("serializes updateProject payloads with only defined fields", async () => {
    mocks.invoke.mockResolvedValue({ id: "proj-123" });

    await updateProject({
      id: "proj-123",
      updatedAt: "2026-06-18T12:00:00.000Z",
      name: "Renamed",
      settings: { webSearchEnabled: false },
      lastOpenedAt: "2026-06-18T12:30:00.000Z",
    });

    const payload = JSON.parse(mocks.invoke.mock.calls[0][1].input as string) as Record<string, unknown>;
    expect(payload).toEqual({
      id: "proj-123",
      updatedAt: "2026-06-18T12:00:00.000Z",
      name: "Renamed",
      settingsJson: '{"webSearchEnabled":false}',
      lastOpenedAt: "2026-06-18T12:30:00.000Z",
    });
  });

  it("forwards deleteProject to the backend", async () => {
    await deleteProject("proj-123");

    expect(mocks.invoke).toHaveBeenCalledWith("delete_project", { id: "proj-123" });
  });
});
