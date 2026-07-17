# Projects Key Types

From `src/modules/projects/project-types.ts`:

```typescript
type ProjectKind =
  | "app" | "class" | "client" | "codebase"
  | "creative" | "research" | "general";

type ProjectStatus = "active" | "paused" | "archived";

interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  color: string;
  icon: string;
  systemPrompt: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

interface ProjectSettings {
  memoryEnabled?: boolean;
  memoryMode?: MemoryMode;
  webSearchEnabled?: boolean;
  webSearchMode?: "auto" | "always" | "off";
  webSearchFetchEnabled?: boolean;
  webSearchFetchCount?: number;
  webSearchPerPageTimeoutSecs?: number;
  webSearchFetchMaxCharsPerSource?: number;
  webSearchContextTokenLimit?: number;
  enabledTools?: {
    documents: boolean;
    webSearch: boolean;
  };
  modelId?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  agentProjectPath?: string;
}
```

All `ProjectSettings` fields are optional — they override global defaults only when set.
