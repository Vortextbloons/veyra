import type { EmailMessage } from "./email-types";

export const EMAIL_AI_PROMPT_VERSION = "1.0.0";

export type EmailAiTaskType =
  | "thread_summary"
  | "classification"
  | "spam_score"
  | "urgency_score";

function formatMessagesForPrompt(messages: EmailMessage[]): string {
  return messages
    .map((m) => {
      const from = `${m.from.name} <${m.from.email}>`;
      const date = new Date(m.timestamp).toISOString();
      const body = m.body.length > 2000 ? m.body.slice(0, 2000) + "..." : m.body;
      return `[${date}] From: ${from}\n${body}`;
    })
    .join("\n\n---\n\n");
}

const SUMMARY_SYSTEM = `You are an email assistant. Summarize the email thread concisely.
Respond with JSON only, no markdown fences:
{"shortSummary":"1-2 sentence overview","latestChange":"what changed in the latest message","openQuestions":"unanswered questions or pending items, or empty string","suggestedAction":"recommended next step, or empty string"}`;

const CLASSIFICATION_SYSTEM = `You are an email classifier. Categorize this email and suggest tags.
Respond with JSON only, no markdown fences:
{"category":"primary category (work, personal, finance, travel, notification, newsletter, other)","tags":["tag1","tag2"],"needsReply":true|false,"confidence":0.0-1.0,"reason":"brief explanation"}`;

const SPAM_SYSTEM = `You are an email safety classifier. Score this email for spam and marketing content.
Respond with JSON only, no markdown fences:
{"spamScore":0.0-1.0,"marketingScore":0.0-1.0,"newsletter":true|false,"reason":"brief explanation"}`;

const URGENCY_SYSTEM = `You are an email urgency assessor. Determine how time-sensitive this email is.
Respond with JSON only, no markdown fences:
{"level":"critical|high|medium|low","deadline":"deadline if mentioned, or empty string","reason":"brief explanation"}`;

export function buildSummaryPrompt(messages: EmailMessage[]): {
  system: string;
  user: string;
} {
  return {
    system: SUMMARY_SYSTEM,
    user: `Summarize this email thread:\n\n${formatMessagesForPrompt(messages)}`,
  };
}

export function buildClassificationPrompt(messages: EmailMessage[]): {
  system: string;
  user: string;
} {
  return {
    system: CLASSIFICATION_SYSTEM,
    user: `Classify this email:\n\n${formatMessagesForPrompt(messages)}`,
  };
}

export function buildSpamPrompt(messages: EmailMessage[]): {
  system: string;
  user: string;
} {
  return {
    system: SPAM_SYSTEM,
    user: `Score this email for spam/marketing:\n\n${formatMessagesForPrompt(messages)}`,
  };
}

export function buildUrgencyPrompt(messages: EmailMessage[]): {
  system: string;
  user: string;
} {
  return {
    system: URGENCY_SYSTEM,
    user: `Assess urgency of this email:\n\n${formatMessagesForPrompt(messages)}`,
  };
}

export function buildPromptForTask(
  taskType: EmailAiTaskType,
  messages: EmailMessage[],
): { system: string; user: string } {
  switch (taskType) {
    case "thread_summary":
      return buildSummaryPrompt(messages);
    case "classification":
      return buildClassificationPrompt(messages);
    case "spam_score":
      return buildSpamPrompt(messages);
    case "urgency_score":
      return buildUrgencyPrompt(messages);
  }
}

export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
