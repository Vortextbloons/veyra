# Characters Key Types

From `src/modules/characters/character-types.ts`:

```typescript
type CharacterSpec = "veyra" | "chara_card_v3";
type CharacterSource = "native" | "imported_ccv3" | "duplicate";
type CharacterScope = "global" | "project";

interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  avatarPath?: string;
  avatarColor?: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions?: string;
  exampleMessages: ExampleMessage[];
  creatorNotes: string;
  tags: string[];
  category?: string;
  version: string;
  spec: CharacterSpec;
  creator: string;
  source: CharacterSource;
  isGlobal: boolean;
  projectId?: string;
  creatorMetadata?: Record<string, unknown>;
  stats: CharacterStats;
  lorebookEntries?: CharacterLorebookEntry[];
  chatDefaults?: CharacterChatDefaults;
  createdAt: string;
  updatedAt: string;
}

interface CharacterLorebookEntry {
  id: string;
  characterId: string;
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  constant: boolean;
  selective: boolean;
  insertionOrder: number;
  priority: 1 | 2 | 3 | 4 | 5;
  enabled: boolean;
  matchType: "any" | "all" | "regex";
  caseSensitive: boolean;
  scope: "character" | "global";
  group?: string;
  comment?: string;
  position: "before" | "after";
  probability?: number;
  recurseDepth?: number;
  createdAt: string;
  updatedAt: string;
}

interface CharacterChatDefaults {
  scanDepth: number;
  maxLorebookEntries: number;
  includeExamples: boolean;
  allowDocumentTools: boolean;
}

interface CharacterGroupRecord {
  id: string;
  name: string;
  description: string;
  scenario: string;
  memberIds: string[];
  speakerMode: "manual" | "auto";
  recentConversationIds: string[];
  openingMessage: string;
  activeSpeakerId?: string;
  isGlobal: boolean;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}
```
