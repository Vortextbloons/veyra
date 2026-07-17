# Memory Modes

The memory system operates in one of 5 modes, controlling the balance between automatic capture and user control.

| Mode | Behavior |
|------|----------|
| `off` | No extraction or retrieval |
| `manual_only` | Only explicit "remember this" saves |
| `safe_auto_save` | Auto-save high-confidence extractions |
| `review_all` | Extract everything, require manual approval |
| `aggressive_project_memory` | Maximum extraction with project scoping |

## Mode Selection

- Mode is set globally in settings and can be overridden per project
- `off` is useful for sensitive or transient conversations
- `aggressive_project_memory` is designed for long-running project work where maximum context capture is desired
