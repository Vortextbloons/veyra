export type MemoryScope = {
  projectId?: string;
};

export type MemoryTurnInput = {
  sourceType: "chat" | "agent";
  sourceId: string;
  turnId: string;
  userText: string;
  assistantText: string;
  projectId?: string;
  model: string;
  providerId: string;
};

export type MemoryRecord = {
  id: string;
  text: string;
  projectId?: string;
  sourceType: "chat" | "agent";
  sourceId: string;
  turnId: string;
  createdAt: number;
  updatedAt: number;
};
