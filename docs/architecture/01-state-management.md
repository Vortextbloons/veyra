# State Management

Cross-cutting architecture patterns for state management.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Central conversation state |
| `src/stores/settings-store.ts` | Combined settings (12 slices) |
| `src/stores/provider-store.ts` | Provider and model management |
| `src/stores/connectivity-store.ts` | Connectivity state |
| `src/stores/update-store.ts` | App update state |

## Zustand Stores (13 total)

Stores live in both `src/stores/` and `src/modules/<feature>/`:

| Store Hook | Location | Purpose |
|------------|----------|---------|
| `useChatStore` | `src/stores/chat-store.ts` | Conversations, streaming buffer, messages |
| `useSettingsStore` | `src/stores/settings-store.ts` | All app settings (12 slices) |
| `useProviderStore` | `src/stores/provider-store.ts` | Provider connection, model listing |
| `useConnectivityStore` | `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `useUpdateStore` | `src/stores/update-store.ts` | App update state |
| `useMemoryStore` | `src/modules/memory/memory-store.ts` | Memory nodes, folders, files |
| `useDocumentStore` | `src/modules/documents/document-store.ts` | Documents with auto-save |
| `useCharacterStore` | `src/modules/characters/character-store.ts` | Character records |
| `useCharacterGroupStore` | `src/modules/characters/character-group-store.ts` | Character groups |
| `useCharacterAssistStore` | `src/modules/characters/ai-assist/ai-assist-store.ts` | AI-assisted creation state |
| `useProjectStore` | `src/modules/projects/project-store.ts` | Projects |
| `useResearchStore` | `src/modules/research/research-store.ts` | Research runs and reports |
| `useAgentStore` | `src/modules/agents/agent-store.ts` | Agent sessions |

## Settings Store (11 Slices)

The settings store is composed from 11 slices in `src/stores/slices/`:

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, panel collapsed state, visible tool settings |
| `model-slice` | `model-slice.ts` | Default model, temperature, context length |
| `memory-slice` | `memory-slice.ts` | Memory mode, scope limits |
| `web-search-slice` | `web-search-slice.ts` | SearXNG URL, provider settings |
| `document-slice` | `document-slice.ts` | Auto-save delay, default type |
| `character-slice` | `character-slice.ts` | AI assist model, max tokens, tone settings |
| `research-slice` | `research-slice.ts` | Default depth, approval requirements |
| `code-execution-slice` | `code-execution-slice.ts` | Python path, timeout |
| `connectivity-slice` | `connectivity-slice.ts` | Online/offline preference |
| `chat-slice` | `chat-slice.ts` | Workspace mode, context anchoring, enhanced mode |
| `update-slice` | `update-slice.ts` | Auto-check updates, dismissed version |

All settings persist to localStorage under `veyra.settings.v1`.
