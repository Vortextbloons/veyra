import { describe, expect, it } from "vitest";
import {
  migrateLegacyStudioArtifactToMessages,
  normalizeConversationStudio,
  normalizeStudioResponse,
  resolveConversationExperience,
  STUDIO_MAX_RESPONSE_REVISIONS,
  trimStudioResponseRevisions,
} from "@/modules/chat/studio/studio-normalize";
import {
  legacyStudioConversationFixture,
  malformedStudioConversationFixture,
  mixedExperienceWinsFixture,
  mixedStudioConversationFixture,
  nativeStudioConversationFixture,
  noAssistantStudioConversationFixture,
  standardConversationFixture,
  unmatchedProducerStudioConversationFixture,
} from "@/modules/chat/studio/studio-migration-fixtures";

describe("Studio Stage 1 experience resolution", () => {
  it("normalizes missing experience to standard", () => {
    expect(resolveConversationExperience({})).toBe("standard");
    expect(resolveConversationExperience({ presentationMode: "standard" })).toBe("standard");
  });

  it("keeps native studio experience", () => {
    expect(resolveConversationExperience({ experience: "studio" })).toBe("studio");
  });

  it("maps legacy studio presentation to studio only when experience is absent", () => {
    expect(resolveConversationExperience({ presentationMode: "studio" })).toBe("studio");
    expect(resolveConversationExperience({
      experience: "standard",
      presentationMode: "studio",
    })).toBe("standard");
  });

  it("treats unrecognized experience as standard without legacy fallback", () => {
    expect(resolveConversationExperience({
      experience: "future",
      presentationMode: "studio",
    })).toBe("standard");
  });
});

describe("Studio Stage 1 migration fixtures", () => {
  it("migrates legacy revisions onto matching assistant messages", () => {
    const normalized = normalizeConversationStudio(legacyStudioConversationFixture());
    expect(normalized.experience).toBe("studio");
    expect(normalized.presentationMode).toBe("studio");
    expect(normalized.studioArtifact?.id).toBe("artifact-legacy");

    const first = normalized.messages.find((message) => message.id === "assistant-1");
    const second = normalized.messages.find((message) => message.id === "assistant-2");
    expect(first?.studioResponse?.id).toBe("artifact-legacy:assistant-1");
    expect(first?.studioResponse?.revisions).toHaveLength(1);
    expect(first?.studioResponse?.title).toBe("One");
    expect(second?.studioResponse?.id).toBe("artifact-legacy:assistant-2");
    expect(second?.studioResponse?.title).toBe("Two");
  });

  it("keeps native studio responses without requiring legacy fields", () => {
    const normalized = normalizeConversationStudio(nativeStudioConversationFixture());
    expect(normalized.experience).toBe("studio");
    expect(normalized.presentationMode).toBe("studio");
    expect(normalized.studioArtifact).toBeUndefined();
    expect(normalized.messages[1]?.studioResponse?.id).toBe("response-native-1");
  });

  it("lets native message responses win over legacy conversion", () => {
    const normalized = normalizeConversationStudio(mixedStudioConversationFixture());
    const first = normalized.messages.find((message) => message.id === "assistant-1");
    const second = normalized.messages.find((message) => message.id === "assistant-2");

    expect(first?.studioResponse?.id).toBe("response-native-keep");
    expect(first?.studioResponse?.title).toBe("Native");
    expect(first?.studioResponse?.revisions.map((revision) => revision.title)).toEqual([
      "Native v1",
      "Native",
    ]);
    expect(second?.studioResponse?.id).toBe("artifact-mixed:assistant-2");
    expect(second?.studioResponse?.title).toBe("LegacySecond");
    expect(normalized.studioArtifact?.id).toBe("artifact-mixed");
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
    expect(normalized.studioArtifact?.revisions).toHaveLength(1);
  });

  it("falls back unmatched producers to the latest assistant when safe", () => {
    const normalized = normalizeConversationStudio(unmatchedProducerStudioConversationFixture());
    const assistant = normalized.messages.find((message) => message.id === "assistant-1");
    expect(assistant?.studioResponse?.id).toBe("artifact-unmatched");
    expect(assistant?.studioResponse?.title).toBe("Orphan");
    expect(normalized.studioArtifact?.id).toBe("artifact-unmatched");
  });

  it("keeps recovery data when there is no assistant message", () => {
    const normalized = normalizeConversationStudio(noAssistantStudioConversationFixture());
    expect(normalized.experience).toBe("studio");
    expect(normalized.messages).toHaveLength(1);
    expect(normalized.messages[0]?.studioResponse).toBeUndefined();
    expect(normalized.studioArtifact?.id).toBe("artifact-no-assistant");
  });

  it("normalizes standard conversations without inventing studio data", () => {
    const normalized = normalizeConversationStudio(standardConversationFixture());
    expect(normalized.experience).toBe("standard");
    expect(normalized.presentationMode).toBe("standard");
    expect(normalized.studioArtifact).toBeUndefined();
    expect(normalized.messages.every((message) => !message.studioResponse)).toBe(true);
  });

  it("lets native experience win in mixed experience snapshots", () => {
    const normalized = normalizeConversationStudio(mixedExperienceWinsFixture());
    expect(normalized.experience).toBe("standard");
    expect(normalized.presentationMode).toBe("standard");
    // Legacy recovery retained; do not convert into a Standard conversation.
    expect(normalized.studioArtifact?.id).toBe("artifact-ignored-for-experience");
    expect(normalized.messages.every((message) => !message.studioResponse)).toBe(true);
  });

  it("is idempotent and preserves stable ids and selected pointers", () => {
    const first = normalizeConversationStudio(legacyStudioConversationFixture());
    const second = normalizeConversationStudio(first);
    expect(second).toEqual(first);

    const mixedOnce = normalizeConversationStudio(mixedStudioConversationFixture());
    const mixedTwice = normalizeConversationStudio(mixedOnce);
    expect(mixedTwice.messages[1]?.studioResponse?.id).toBe("response-native-keep");
    expect(mixedTwice.messages[1]?.studioResponse?.currentRevision).toBe(2);
    expect(mixedTwice.messages[3]?.studioResponse?.id).toBe(
      mixedOnce.messages[3]?.studioResponse?.id,
    );
    expect(mixedTwice).toEqual(mixedOnce);
  });

  it("does not duplicate native revisions when legacy data remains", () => {
    const { messages, stats } = migrateLegacyStudioArtifactToMessages(
      mixedStudioConversationFixture().messages,
      mixedStudioConversationFixture().studioArtifact,
    );
    expect(stats.nativeResponses).toBe(1);
    expect(stats.migratedGroups).toBe(1);
    expect(messages[1]?.studioResponse?.revisions).toHaveLength(2);
    expect(messages[1]?.studioResponse?.revisions.some((revision) => revision.title === "ShouldNotOverwrite")).toBe(false);
  });
});

describe("Studio Stage 1 response normalization helpers", () => {
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
