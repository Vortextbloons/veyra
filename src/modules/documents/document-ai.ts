import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ChatMessage } from "@/modules/chat/chat-types";

function makeChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

export type AiAssistAction =
  | "improve"
  | "expand"
  | "shorten"
  | "rewrite"
  | "summarize"
  | "translate"
  | "tone"
  | "outline"
  | "research_draft"
  | "custom";

export interface AiAssistParams {
  targetLanguage?: string;
  tone?: string;
  outlineDepth?: number;
  researchQuery?: string;
}

export type AiAssistMessage = {
  role: "user" | "assistant";
  content: string;
  action?: AiAssistAction;
};

function buildActionPrompt(action: AiAssistAction, params?: AiAssistParams): string {
  switch (action) {
    case "improve":
      return "Improve the following text for clarity, flow, grammar, and polish. Preserve the original meaning and tone. Return only the improved text, no explanations.";
    case "expand":
      return "Expand the following text with more detail, examples, or explanation. Match the existing tone. Return only the expanded text.";
    case "shorten":
      return "Condense the following text to be more concise while preserving the key meaning. Return only the shortened text.";
    case "rewrite":
      return "Rewrite the following text in a clearer, more polished way. Return only the rewritten text.";
    case "summarize":
      return "Provide a concise summary of the following document. Return only the summary.";
    case "translate":
      return `Translate the following text to ${params?.targetLanguage ?? "English"}. Preserve all markdown formatting, headings, links, and code blocks. Return only the translated text.`;
    case "tone":
      return `Rewrite the following text in a ${params?.tone ?? "formal"} tone. Preserve the meaning and all markdown formatting. Return only the rewritten text.`;
    case "outline":
      return `Generate a structured outline for the following document. Use markdown headings (H1-H3) with brief descriptions under each. Depth: ${params?.outlineDepth ?? 2} levels.`;
    case "research_draft":
      return `Using the following document as context, expand the section about ${params?.researchQuery ?? "the main topic"} with well-sourced information. Cite sources inline where appropriate.`;
    case "custom":
      return "";
  }
}

export function buildAiMessages(
  documentContent: string,
  documentTitle: string,
  action: AiAssistAction,
  userPrompt: string,
  selectedText?: string,
  history?: AiAssistMessage[],
  params?: AiAssistParams,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  const systemContent = `You are a professional writing assistant helping with a document titled "${documentTitle}".

Rules:
- Return ONLY the requested text, no preamble or explanation
- Preserve markdown formatting
- Match the document's existing tone and style
- For edits, return only the changed text unless asked for the full document`;

  messages.push(makeChatMessage("system", systemContent));

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push(makeChatMessage(msg.role, msg.content));
    }
  }

  const actionPrompt = buildActionPrompt(action, params);
  let userContent: string;

  if (action === "custom") {
    if (selectedText) {
      userContent = `Selected text:\n\n${selectedText}\n\nInstruction: ${userPrompt}`;
    } else {
      const truncated =
        documentContent.length > 8000
          ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
          : documentContent;
      userContent = `Document content:\n\n${truncated}\n\nInstruction: ${userPrompt}`;
    }
  } else if (action === "summarize") {
    const truncated =
      documentContent.length > 8000
        ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
        : documentContent;
    userContent = `${actionPrompt}\n\nDocument:\n\n${truncated}`;
  } else if (selectedText) {
    userContent = `${actionPrompt}\n\nSelected text:\n\n${selectedText}`;
  } else {
    const truncated =
      documentContent.length > 8000
        ? documentContent.slice(0, 8000) + "\n\n[Document truncated for length]"
        : documentContent;
    userContent = `${actionPrompt}\n\nFull document:\n\n${truncated}`;
  }

  messages.push(makeChatMessage("user", userContent));

  return messages;
}

export async function streamAiAssist(options: {
  messages: ChatMessage[];
  onChunk: (content: string, done: boolean) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { messages, onChunk, onError, signal } = options;

  const providerState = useProviderStore.getState();
  const adapter = getProviderAdapter(providerState.selectedProvider);
  if (!adapter) {
    onError("No provider available. Connect to LM Studio first.");
    return;
  }

  const modelSettings = useSettingsStore.getState().getModelSettings(providerState.selectedModel);

  await adapter.sendChat({
    messages,
    model: providerState.selectedModel,
    temperature: modelSettings.temperature,
    maxTokens: modelSettings.maxTokens,
    topP: modelSettings.topP,
    repetitionPenalty: modelSettings.repetitionPenalty,
    contextLength: modelSettings.contextLength,
    signal,
    onChunk,
    onError,
  });
}

// ---------------------------------------------------------------------------
// Research-backed drafting
// ---------------------------------------------------------------------------

export async function streamResearchDraft(options: {
  documentContent: string;
  query: string;
  signal?: AbortSignal;
  onChunk: (content: string, done: boolean) => void;
  onError: (error: string) => void;
}): Promise<void> {
  const { documentContent, query, signal, onChunk, onError } = options;

  const settings = useSettingsStore.getState();
  if (!settings.defaultWebSearchEnabled) {
    onError("Research-backed drafting requires SearXNG. Enable it in Settings > Web Search.");
    return;
  }

  try {
    const { runSearch, buildSearchContextBlock } = await import(
      "@/modules/web-search/orchestrator/SearchOrchestrator"
    );
    const bundle = await runSearch(query, { signal, skipFetch: true });
    const contextBlock = buildSearchContextBlock(bundle);

    const truncated =
      documentContent.length > 6000
        ? documentContent.slice(0, 6000) + "\n\n[Document truncated for length]"
        : documentContent;

    const messages: ChatMessage[] = [
      makeChatMessage(
        "system",
        `You are a research assistant helping expand a document. Use the provided search results to add well-sourced information. Cite sources inline where appropriate. Preserve markdown formatting and match the document's tone.`,
      ),
      makeChatMessage(
        "user",
        `Search results:\n${contextBlock}\n\nDocument:\n${truncated}\n\nExpand the section about: ${query}`,
      ),
    ];

    await streamAiAssist({ messages, onChunk, onError, signal });
  } catch (error) {
    onError(`Research search failed: ${String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// AI-powered document linking
// ---------------------------------------------------------------------------

export interface DocumentLinkSuggestion {
  documentId: string;
  title: string;
  relevance: number;
  reason: string;
}

export async function suggestDocumentLinks(options: {
  documentContent: string;
  allDocuments: Array<{ id: string; title: string; contentMarkdown: string }>;
  signal?: AbortSignal;
}): Promise<DocumentLinkSuggestion[]> {
  const { documentContent, allDocuments, signal } = options;

  const providerState = useProviderStore.getState();
  const adapter = getProviderAdapter(providerState.selectedProvider);
  if (!adapter || allDocuments.length === 0) {
    return [];
  }

  const docSummaries = allDocuments
    .map((d) => `- "${d.title}" (ID: ${d.id}): ${d.contentMarkdown.slice(0, 200)}...`)
    .join("\n");

  const truncated =
    documentContent.length > 4000
      ? documentContent.slice(0, 4000) + "\n\n[Document truncated for length]"
      : documentContent;

  const messages: ChatMessage[] = [
    makeChatMessage(
      "system",
      `You are a document analysis assistant. Given a document and a list of other documents, suggest which documents are related and why. Return a JSON array of suggestions, each with: documentId (string), title (string), relevance (number 0-1), reason (string). Return ONLY the JSON array, no other text.`,
    ),
    makeChatMessage(
      "user",
      `Current document:\n${truncated}\n\nOther documents:\n${docSummaries}\n\nSuggest related documents.`,
    ),
  ];

  const modelSettings = useSettingsStore.getState().getModelSettings(providerState.selectedModel);

  let fullText = "";
  await adapter.sendChat({
    messages,
    model: providerState.selectedModel,
    temperature: modelSettings.temperature,
    maxTokens: 1000,
    topP: modelSettings.topP,
    repetitionPenalty: modelSettings.repetitionPenalty,
    contextLength: modelSettings.contextLength,
    signal,
    onChunk: (chunk, done) => {
      fullText += chunk;
      if (done) {
        try {
          const parsed = JSON.parse(fullText) as DocumentLinkSuggestion[];
          return parsed;
        } catch {
          return [];
        }
      }
    },
    onError: () => {},
  });

  try {
    const cleaned = fullText.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as DocumentLinkSuggestion[];
  } catch {
    return [];
  }
}
