# Characters Overview

Roleplay persona system with Character Card V3 support, lorebook matching, group chat, and AI-assisted creation.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/characters/character-types.ts` | Type definitions |
| `src/modules/characters/character-store.ts` | Zustand store for characters |
| `src/modules/characters/character-storage.ts` | Tauri IPC layer |
| `src/modules/characters/character-chat.ts` | Character chat helpers |
| `src/modules/characters/character-context.ts` | Builds character context block |
| `src/modules/characters/lorebook.ts` | Lorebook evaluation engine |
| `src/modules/characters/character-export.ts` | Export (Veyra JSON, CCv3 JSON, CCv3 PNG) |
| `src/modules/characters/ai-assist/` | AI-assisted creation and CCv3 I/O |

## Character Fields

| Field | Description |
|-------|-------------|
| `name` | Character name (displayed in chat) |
| `title` | Short subtitle |
| `description` | Character description |
| `personality` | Personality traits |
| `scenario` | Setting/scenario context |
| `firstMessage` | Opening greeting |
| `alternateGreetings` | Multiple greeting options |
| `systemPrompt` | Custom system prompt override |
| `postHistoryInstructions` | Instructions after chat history |
| `exampleMessages` | Few-shot example messages |
| `lorebookEntries` | Contextual knowledge entries |
| `chatDefaults` | Per-character chat settings |

## Starting a Character Chat

1. `startCharacterChat()` creates a new conversation bound to the character
2. The greeting is randomly picked from `firstMessage` + `alternateGreetings`
3. The conversation is pre-seeded with the greeting as the first assistant message
4. Character identity snapshots are preserved even if the character is later deleted or renamed

## Character Chat Defaults

Per-character settings that override global settings:

| Setting | Description |
|---------|-------------|
| `scanDepth` | How many messages to scan for lorebook matches |
| `maxLorebookEntries` | Maximum lorebook entries to inject |
| `includeExamples` | Whether to include few-shot examples |
| `allowDocumentTools` | Whether doc tools are available in character chat |
