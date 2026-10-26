# Chat Artifacts

Artifacts are finished outputs attached to an assistant message. The `create_artifact` tool supports three formats:

| Format | Content and use |
| --- | --- |
| `html` | Self-contained visual pages, diagrams, comparisons, timelines, reports, and print layouts. |
| `document` | Markdown deliverables with a simple title and text editor. |
| `code` | Downloadable source and configuration files; artifact creation does not execute them. |

Chat remains the default for explanations and advice. The model creates an artifact for an explicit deliverable request or when a visual output materially improves the answer. Each assistant message can own at most one artifact. The Artifacts switch is in Chat settings and is enabled by default.

## Viewer

The message attachment shows its title, format, and size. It supports collapse, full-screen viewing, source copy, and format-aware download. HTML artifacts have Preview and Source views and a print action. Documents render Markdown and can be edited with a basic title field and Markdown textarea; saving replaces the message-owned document content without a revision history or advanced editing tools.

HTML and code source are displayed as text or inside a sandboxed preview. Code files are downloaded and never run. Documents download as Markdown by default. Explicit filenames are accepted only as a single basename, without folder paths.

## Validation and context

- Artifact content is limited to 256 KiB in UTF-8 bytes. Oversized content is rejected without truncation.
- The UI and tool host generate the artifact id and timestamp.
- Regeneration keeps the previous artifact message until a new artifact saves successfully; failed or cancelled generation leaves the previous output available.
- Tool state and the tool result keep only the title, format, and status. The complete artifact is saved on its assistant message and removed from prior-message provider history.
- Conversation persistence stores artifacts with the owning conversation snapshot.

## HTML preview boundary

In Tauri, the frontend registers an HTML artifact with a Rust in-memory preview store. The store accepts UUID-shaped ids, limits content to 256 KiB, holds at most 32 previews, and expires entries after 24 hours. It serves only a matching `GET` preview request. No artifact files are written for previewing.

The preview response sets a restrictive CSP: inline CSS/SVG and inline scripts are allowed, while network connections, external images/fonts/media, forms, nested frames, workers, and embedded objects are blocked. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, and the application CSP permits frames only from the artifact preview scheme. This keeps artifact code in an opaque origin without the app's same-origin Tauri IPC access. The CSP and iframe sandbox are applied together.

## Key files

| File | Purpose |
| --- | --- |
| `src/modules/chat/artifact.ts` | Artifact format, size validation, metadata, and download filename rules. |
| `src/modules/chat/tools/artifact-tool.ts` | Validates and attaches the `create_artifact` tool result. |
| `src/modules/chat/components/artifact-block.tsx` | Message viewer, HTML preview, document editor, copy, download, and print controls. |
| `src-tauri/src/artifact_preview.rs` | Bounded in-memory preview protocol and response security headers. |

