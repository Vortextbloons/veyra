import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Studio Stage 5 split-pane retirement", () => {
  it("has no live split-pane, shell, or legacy presentation wiring in production sources", () => {
    const roots = [
      "src/app/components/chat-panel.tsx",
      "src/app/App.tsx",
      "src/modules/chat/components/composer.tsx",
      "src/stores/chat-store.ts",
      "src/modules/chat/chat-orchestrator.ts",
      "src/modules/chat/chat-provider-options.ts",
      "src/modules/chat/chat-types.ts",
    ];

    const banned = [
      "StudioSplitLayout",
      "StudioShell",
      "VITE_SHOW_LEGACY_STUDIO_PANEL",
      "onPresentationModeChange",
      "setConversationPresentation",
      "commitStudioRevision",
      "selectStudioRevision",
      "undoStudioRevision",
      "previousStudioRevision",
    ];

    for (const root of roots) {
      const source = readFileSync(resolve(process.cwd(), root), "utf8");
      for (const token of banned) {
        expect(source.includes(token), `${root} still references ${token}`).toBe(false);
      }
    }
  });

  it("does not ship the retired split-pane modules", () => {
    const missing = [
      "src/modules/chat/studio/studio-split-layout.tsx",
      "src/modules/chat/studio/components/studio-shell.tsx",
    ];
    for (const path of missing) {
      expect(() => readFileSync(resolve(process.cwd(), path))).toThrow();
    }
  });
});
