# Document Editor

## Active Document Draft

- The active document maintains an in-memory draft to avoid remapping on every keystroke
- Draft content is separate from the persisted version
- Draft is reconciled to persistent storage on save

## Auto-Save

- Debounced save (configurable delay) avoids excessive writes
- Each save creates a version snapshot
- Version snapshots track change source: `user`, `assistant`, or `system`

## Export

- Export to **Markdown** (.md) or **Plain Text** (.txt)
- Uses Tauri save dialog for file location selection
- Document content is written directly to the selected file

## Inline AI

The `use-inline-ai.ts` hook provides AI-assisted editing within the document editor, enabling AI completion and suggestions while editing.
