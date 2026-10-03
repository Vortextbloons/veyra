import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DocumentRecord } from "@/modules/documents/document-types";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  createDocumentVersion: vi.fn(),
  listDocumentVersions: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  exportDocumentMarkdown: vi.fn(),
  exportDocumentTxt: vi.fn(),
  listDocumentFolders: vi.fn(),
  createDocumentFolder: vi.fn(),
  updateDocumentFolder: vi.fn(),
  deleteDocumentFolder: vi.fn(),
  moveDocumentToFolder: vi.fn(),
}));

vi.mock("@/lib/document-storage", () => mocks);

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      documentAutoSaveEnabled: true,
      documentAutoSaveDelay: 60_000,
      documentAutoOpenOnCreate: true,
    }),
  },
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: { subscribe: () => () => undefined },
}));

vi.mock("@/modules/projects/project-store", () => ({
  useProjectStore: { subscribe: () => () => undefined },
}));

import { useDocumentStore } from "@/modules/documents/document-store";

function createDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "docA",
    isGlobal: false,
    title: "Doc A",
    type: "document",
    status: "draft",
    editorFormat: "markdown",
    contentMarkdown: "content-A",
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const docA = createDoc({ id: "docA", title: "Doc A", contentMarkdown: "content-A" });
const docB = createDoc({ id: "docB", title: "Doc B", contentMarkdown: "content-B" });
const versionA = { id: "ver-a", documentId: "docA", contentMarkdown: "content-A", createdAt: "2026-01-02T00:00:00Z" };
const versionB = { id: "ver-b", documentId: "docB", contentMarkdown: "content-B", createdAt: "2026-01-02T00:00:00Z" };

function resetStore() {
  useDocumentStore.setState({
    documents: [],
    activeDocumentId: null,
    activeDraftContent: null,
    versions: [],
    isLoading: false,
    error: null,
    saveStatus: "idle",
    _debounceTimer: null,
    _lastSavedContent: null,
    _savePromise: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mocks.getDocument.mockImplementation((id: string) =>
    Promise.resolve(id === "docB" ? docB : docA),
  );
  mocks.listDocumentVersions.mockImplementation((id: string) =>
    Promise.resolve(id === "docB" ? [versionB] : [versionA]),
  );
  mocks.createDocumentVersion.mockImplementation((input: { documentId: string; contentMarkdown: string }) =>
    Promise.resolve({
      id: `ver-${Math.random().toString(36).slice(2, 8)}`,
      documentId: input.documentId,
      contentMarkdown: input.contentMarkdown,
      createdAt: "2026-01-02T00:00:00Z",
    }),
  );
});

afterEach(() => {
  const timer = useDocumentStore.getState()._debounceTimer;
  if (timer) clearTimeout(timer);
});

describe("document store save races", () => {
  it("save completion preserves a draft typed while the save was in flight", async () => {
    let resolveSave!: (doc: DocumentRecord) => void;
    mocks.updateDocument.mockImplementation(
      () => new Promise<DocumentRecord>((resolve) => { resolveSave = resolve; }),
    );

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "v1",
      _lastSavedContent: "persisted-old",
    });

    const savePromise = useDocumentStore.getState().saveNow();
    useDocumentStore.getState().setContent("v2");
    resolveSave({ ...docA, contentMarkdown: "v1" });

    await expect(savePromise).resolves.toBe(true);
    const state = useDocumentStore.getState();
    expect(state.activeDraftContent).toBe("v2");
    expect(state._lastSavedContent).toBe("v1");
    expect(state.saveStatus).toBe("saving");
    expect(state.documents[0].contentMarkdown).toBe("v1");
  });

  it("save completion resets the draft when the user did not type during the save", async () => {
    mocks.updateDocument.mockResolvedValue({ ...docA, contentMarkdown: "v1" });

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "v1",
      _lastSavedContent: "persisted-old",
    });

    await expect(useDocumentStore.getState().saveNow()).resolves.toBe(true);
    const state = useDocumentStore.getState();
    expect(state.activeDraftContent).toBe("v1");
    expect(state._lastSavedContent).toBe("v1");
    expect(state.saveStatus).toBe("saved");
  });

  it("serializes concurrent saves so content is persisted in submission order", async () => {
    const resolvers: Array<(doc: DocumentRecord) => void> = [];
    mocks.updateDocument.mockImplementation(
      () => new Promise<DocumentRecord>((resolve) => { resolvers.push(resolve); }),
    );

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "v1",
      _lastSavedContent: null,
    });

    const first = useDocumentStore.getState().saveNow();
    useDocumentStore.getState().setContent("v2");
    const second = useDocumentStore.getState().saveNow();

    resolvers[0]({ ...docA, contentMarkdown: "v1" });
    await expect(first).resolves.toBe(true);
    resolvers[1]({ ...docA, contentMarkdown: "v2" });
    await expect(second).resolves.toBe(true);

    const submitted = mocks.updateDocument.mock.calls.map(
      (call) => (call[0] as { contentMarkdown: string }).contentMarkdown,
    );
    expect(submitted).toEqual(["v1", "v2"]);
    expect(useDocumentStore.getState()._lastSavedContent).toBe("v2");
    expect(useDocumentStore.getState().activeDraftContent).toBe("v2");
  });

  it("reports failure instead of silently keeping stale state", async () => {
    mocks.updateDocument.mockRejectedValue(new Error("disk full"));

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "v1",
      _lastSavedContent: "persisted-old",
    });

    await expect(useDocumentStore.getState().saveNow()).resolves.toBe(false);
    const state = useDocumentStore.getState();
    expect(state.saveStatus).toBe("error");
    expect(state.activeDraftContent).toBe("v1");
  });
});

describe("document store metadata updates", () => {
  it("renaming a dirty document does not restore the persisted content over the draft", async () => {
    mocks.updateDocument.mockResolvedValue({ ...docA, title: "New Title", contentMarkdown: "persisted-A" });

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "dirty draft",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().renameDocument("docA", "New Title");

    const state = useDocumentStore.getState();
    expect(state.activeDraftContent).toBe("dirty draft");
    expect(state._lastSavedContent).toBe("persisted-A");
    expect(state.documents[0].title).toBe("New Title");
  });

  it("content-bearing updates still sync the draft", async () => {
    mocks.updateDocument.mockResolvedValue({ ...docA, contentMarkdown: "assistant edit" });

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "dirty draft",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().updateDocument({ id: "docA", contentMarkdown: "assistant edit" });

    const state = useDocumentStore.getState();
    expect(state.activeDraftContent).toBe("assistant edit");
    expect(state._lastSavedContent).toBe("assistant edit");
  });
});

describe("document store switching", () => {
  it("flushes the previous dirty draft before switching documents", async () => {
    mocks.updateDocument.mockResolvedValue({ ...docA, contentMarkdown: "draft-A" });

    useDocumentStore.setState({
      documents: [docA, docB],
      activeDocumentId: "docA",
      activeDraftContent: "draft-A",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().openDocument("docB");

    expect(mocks.updateDocument).toHaveBeenCalledWith({ id: "docA", contentMarkdown: "draft-A" });
    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe("docB");
    expect(state.activeDraftContent).toBe("content-B");
    expect(state._lastSavedContent).toBe("content-B");
    expect(state.versions).toEqual([versionB]);
  });

  it("keeps the current document open when flushing its draft fails", async () => {
    mocks.updateDocument.mockRejectedValue(new Error("disk full"));

    useDocumentStore.setState({
      documents: [docA, docB],
      activeDocumentId: "docA",
      activeDraftContent: "draft-A",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().openDocument("docB");

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe("docA");
    expect(state.activeDraftContent).toBe("draft-A");
    expect(state.saveStatus).toBe("error");
  });

  it("ignores a stale openDocument completion for a superseded document", async () => {
    let resolveGetA!: (doc: DocumentRecord) => void;
    mocks.getDocument.mockImplementation((id: string) => {
      if (id === "docA") {
        return new Promise<DocumentRecord>((resolve) => { resolveGetA = resolve; });
      }
      return Promise.resolve(docB);
    });

    void useDocumentStore.getState().openDocument("docA");
    await useDocumentStore.getState().openDocument("docB");

    resolveGetA(docA);
    await Promise.resolve();
    await Promise.resolve();

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe("docB");
    expect(state.activeDraftContent).toBe("content-B");
    expect(state.versions).toEqual([versionB]);
    expect(state.isLoading).toBe(false);
  });
});

describe("document store closing", () => {
  it("does not close when the final save fails", async () => {
    mocks.updateDocument.mockRejectedValue(new Error("disk full"));

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "draft-A",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().closeDocument();

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe("docA");
    expect(state.activeDraftContent).toBe("draft-A");
    expect(state.saveStatus).toBe("error");
  });

  it("closes after a successful save", async () => {
    mocks.updateDocument.mockResolvedValue({ ...docA, contentMarkdown: "draft-A" });

    useDocumentStore.setState({
      documents: [docA],
      activeDocumentId: "docA",
      activeDraftContent: "draft-A",
      _lastSavedContent: "persisted-A",
    });

    await useDocumentStore.getState().closeDocument();

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBeNull();
    expect(state.activeDraftContent).toBeNull();
    expect(state.saveStatus).toBe("idle");
    expect(state._lastSavedContent).toBeNull();
  });
});