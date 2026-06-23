# Projects Module

Persistent local containers that scope chats, documents, memories, tools, and settings around a goal or workstream.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/projects/project-types.ts` | Type definitions |
| `src/modules/projects/project-store.ts` | Zustand store |

## Project Kinds

| Kind | Description |
|------|-------------|
| `app` | Application development |
| `client` | Client work |
| `codebase` | Codebase management |
| `creative` | Creative projects |
| `research` | Research work |
| `general` | General purpose |
| `class` | Educational/coursework |

## Project Statuses

| Status | Description |
|--------|-------------|
| `active` | Currently in use |
| `paused` | On hold |
| `archived` | No longer active |

## Project Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Short description |
| `kind` | Project category |
| `color` | UI accent color |
| `icon` | Display icon |
| `systemPrompt` | Custom system prompt injected into chat |
| `settings` | Per-project overrides |

## Per-Project Settings

| Setting | Description |
|---------|-------------|
| `memoryEnabled` | Enable/disable memory for this project |
| `memoryMode` | Override memory mode |
| `webSearchEnabled` | Enable/disable web search |
| `webSearchMode` | Override web search mode |
| `enabledTools` | Which tools are available |
| `modelId` | Project-specific model selection |
| `temperature` | Model temperature override |
| `contextLength` | Context window override |
| `maxTokens` | Max output tokens override |
| `agentProjectPath` | Workspace path for agents mode |

## How It Works

### Project Activation
1. User selects a project from the project list
2. The project becomes the "active project"
3. Its system prompt is injected into every chat turn as `<veyra_project>`
4. Project-specific settings override global settings

### Context Injection
When a project is active, the system prompt includes:
```xml
<veyra_project>
  <name>Project Name</name>
  <description>Project description</description>
  <kind>Project kind</kind>
  <instructions>Custom system prompt from the project</instructions>
</veyra_project>
```

### Scoped Resources
The following resources can be scoped to a project:
- **Conversations**: Chat threads belong to a project
- **Documents**: Documents can be project-specific
- **Memory**: Memory nodes can be project-scoped

### Project Tracking
- `lastOpenedAt` timestamp is updated when a project is opened
- Projects are sorted by recency by default
- Active/archived filtering in the store

## Key Types

```typescript
interface ProjectRecord {
  id: string
  name: string
  description: string
  kind: ProjectKind
  status: ProjectStatus
  color: string
  icon: string
  systemPrompt: string
  settings: ProjectSettings
  lastOpenedAt: number
  createdAt: number
  updatedAt: number
}

interface ProjectSettings {
  memoryEnabled: boolean
  memoryMode: MemoryMode
  webSearchEnabled: boolean
  webSearchMode: WebSearchMode
  enabledTools: string[]
  modelId?: string
  temperature?: number
  contextLength?: number
  maxTokens?: number
  agentProjectPath?: string
}
```
