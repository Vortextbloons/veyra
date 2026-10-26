import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  artifactDownloadName,
  MAX_ARTIFACT_BYTES,
  normalizeArtifact,
} from "@/modules/chat/artifact";
import { ArtifactBlock } from "@/modules/chat/components/artifact-block";
import { buildProviderTools, CREATE_ARTIFACT_TOOL_NAME } from "@/lib/tool-registry";

describe("artifact validation", () => {
  it("registers the artifact tool independently from Enhanced mode and respects its toggle", () => {
    const base = { webSearchEnabled: false, codeExecutionEnabled: false, enhancedMode: false };

    expect(buildProviderTools({ ...base, artifactsEnabled: true }).map((tool) => tool.function.name)).toContain(CREATE_ARTIFACT_TOOL_NAME);
    expect(buildProviderTools({ ...base, artifactsEnabled: false })).toEqual([]);
  });

  it("accepts the three supported formats and keeps document content editable Markdown", () => {
    for (const format of ["html", "code", "document"] as const) {
      const result = normalizeArtifact({
        format,
        title: "Architecture overview",
        content: format === "document" ? "# Decision\n\nUse the local store." : "output",
        language: format === "code" ? "json" : undefined,
      }, "d9428888-122b-4b24-8f0a-6b3f90e11f10", 123);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.id).toBe("d9428888-122b-4b24-8f0a-6b3f90e11f10");
        expect(result.artifact.createdAt).toBe(123);
        expect(result.artifact.format).toBe(format);
      }
    }
  });

  it("rejects oversized content without truncating it", () => {
    const accepted = normalizeArtifact({ format: "html", title: "Large page", content: "x".repeat(MAX_ARTIFACT_BYTES) }, "id");
    const rejected = normalizeArtifact({ format: "html", title: "Large page", content: "x".repeat(MAX_ARTIFACT_BYTES + 1) }, "id");

    expect(accepted.ok).toBe(true);
    expect(rejected).toEqual({ ok: false, error: "Artifacts must be 256 KB or smaller. Nothing was truncated." });
  });

  it("accepts a single safe filename and rejects path traversal", () => {
    const docker = normalizeArtifact({ format: "code", title: "Container", language: "dockerfile", filename: "Dockerfile", content: "FROM scratch" }, "id");
    const unsafe = normalizeArtifact({ format: "code", title: "Config", filename: "../package.json", content: "{}" }, "id");

    expect(docker.ok && artifactDownloadName(docker.artifact)).toBe("Dockerfile");
    expect(unsafe).toEqual({ ok: false, error: "Use a single safe filename without a folder path." });
  });

  it("renders HTML previews with scripts enabled only in an opaque sandbox", () => {
    const markup = renderToStaticMarkup(
      <ArtifactBlock
        messageId="assistant-1"
        artifact={{
          id: "d9428888-122b-4b24-8f0a-6b3f90e11f10",
          format: "html",
          title: "Untrusted preview",
          content: "<h1>Report</h1><script>window.top.__TAURI_INTERNALS__?.invoke('exit_app')</script>",
          createdAt: 1,
        }}
      />,
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
  });
});
