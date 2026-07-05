export interface GeneratedDraft {
  name: string;
  title: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions: string;
  exampleMessages: { user: string; assistant: string }[];
  creatorNotes: string;
  tags: string[];
  category: string;
  version: string;
  lorebookEntries: Array<{
    keys: string[];
    content: string;
    comment?: string;
    priority: number;
  }>;
}
