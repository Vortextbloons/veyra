import { describe, expect, it } from "vitest";
import {
  normalizeConversationStudio,
  normalizeStudioResponse,
  resolveConversationExperience,
  STUDIO_MAX_RESPONSE_REVISIONS,
  trimStudioResponseRevisions,
} from "@/modules/chat/studio/studio-normalize";
import {
  malformedStudioConversationFixture,
  multiResponseStudioConversationFixture,
  nativeStudioConversationFixture,
  standardConversationFixture,
} from "@/modules/chat/studio/studio-migration-fixtures";

describe("Studio Stage 6 clean cutover — experience resolution", () => {
  it("normalizes missing experience to standard", () => {
    expect(resolveConversationExperience({})).toBe("standard");
  });

  it("keeps native studio experience", () => {
    expect(resolveConversationExperience({ experience: "studio" })).toBe("studio");
  });

  it("treats unrecognized experience as standard without legacy fallback", () => {
    expect(resolveConversationExperience({ experience: "unknown" })).toBe("standard");
  });

  it("ignores obsolete presentationMode (no fallback)", () => {
    // After the cutover, presentationMode is not read at all
    const conv = { id: "c", title: "", messages: [], createdAt: 1, updatedAt: 1 } as const;
    expect(resolveConversationExperience({ ...conv, experience: undefined })).toBe("standard");
  });
});

describe("Studio Stage 6 clean cutover — conversation normalization", () => {
  it("keeps native studio responses", () => {
    const normalized = normalizeConversationStudio(nativeStudioConversationFixture());
    expect(normalized.experience).toBe("studio");
    expect(normalized.messages[1]?.studioResponse?.id).toBe("response-native-1");
  });

  it("normalizes standard conversations without inventing studio data", () => {
    const normalized = normalizeConversationStudio(standardConversationFixture());
    expect(normalized.experience).toBe("standard");
    expect(normalized.messages.every((message) => !message.studioResponse)).toBe(true);
  });

  it("repairs malformed responses narrowly and preserves the conversation", () => {
    const normalized = normalizeConversationStudio(malformedStudioConversationFixture());
    const response = normalized.messages[1]?.studioResponse;
    expect(normalized.id).toBe("conversation-1");
    expect(response?.currentRevision).toBe(2);
    expect(response?.title).toBe("Two");
    expect(response?.status).toBe("ready");
    expect(response?.error).toEqual([{ code: "x", message: "ok" }]);
    expect(response?.revisions).toHaveLength(2);
  });

  it("keeps two message responses independent", () => {
    const normalized = normalizeConversationStudio(multiResponseStudioConversationFixture());
    const first = normalized.messages.find((message) => message.id === "assistant-1");
    const second = normalized.messages.find((message) => message.id === "assistant-2");
    expect(first?.studioResponse?.id).toBe("response-first");
    expect(second?.studioResponse?.id).toBe("response-second");
    expect(first?.studioResponse?.revisions).toHaveLength(1);
    expect(second?.studioResponse?.revisions).toHaveLength(1);
  });

  it("is idempotent and preserves stable ids and selected pointers", () => {
    const first = normalizeConversationStudio(nativeStudioConversationFixture());
    const second = normalizeConversationStudio(first);
    expect(second).toEqual(first);
  });

  it("does not contain obsolete conversation-level studio fields", () => {
    const normalized = normalizeConversationStudio(nativeStudioConversationFixture());
    expect((normalized as Record<string, unknown>).presentationMode).toBeUndefined();
    expect((normalized as Record<string, unknown>).studioArtifact).toBeUndefined();
  });
});

describe("Studio Stage 6 clean cutover — response normalization helpers", () => {
  it("trims message responses to eight revisions while preserving selection", () => {
    const revisions = Array.from({ length: STUDIO_MAX_RESPONSE_REVISIONS + 3 }, (_, index) => ({
      revision: index + 1,
      title: `r${index + 1}`,
      html: "<main>x</main>",
      css: "",
      createdAt: index + 1,
    }));
    const trimmed = trimStudioResponseRevisions(revisions, 2);
    expect(trimmed).toHaveLength(STUDIO_MAX_RESPONSE_REVISIONS);
    expect(trimmed.some((revision) => revision.revision === 2)).toBe(true);
  });

  it("drops malformed response entries and repairs invalid pointers", () => {
    const normalized = normalizeStudioResponse({
      id: "response-1",
      title: "Ignore",
      currentRevision: 50,
      latestRevision: 1,
      revisions: [
        { revision: 1, title: "One", html: "<main>1</main>", css: "", createdAt: 1 },
        { revision: 1, title: "Dup", html: "<main>dup</main>", css: "", createdAt: 2 },
        "bad",
      ],
      status: "ready",
      createdAt: 1,
      updatedAt: 2,
    });
    expect(normalized?.currentRevision).toBe(1);
    expect(normalized?.title).toBe("Dup");
    expect(normalized?.revisions).toHaveLength(1);
  });
});
