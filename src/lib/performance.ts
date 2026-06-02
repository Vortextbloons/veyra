import type { MessagePerformance } from "@/lib/chat-types";
import { estimateTokens } from "@/lib/context";

/** LM Studio `/api/v1/chat` stats object */
export interface LmV1Stats {
  input_tokens?: number;
  total_output_tokens?: number;
  reasoning_output_tokens?: number;
  tokens_per_second?: number;
  time_to_first_token_seconds?: number;
  model_load_time_seconds?: number;
}

/** Legacy `/api/v0/chat/completions` stats object */
interface LmV0Stats {
  tokens_per_second?: number;
  time_to_first_token?: number;
  time_to_first_token_seconds?: number;
  generation_time?: number;
  stop_reason?: string;
}

export type LmChatStats = LmV1Stats & LmV0Stats;

export function buildMessagePerformance(options: {
  content: string;
  startedAt: number;
  completedAt: number;
  firstTokenAt?: number;
  stats?: LmChatStats;
}): MessagePerformance {
  const { content, startedAt, completedAt, firstTokenAt, stats } = options;
  const totalTime = Math.max(0, (completedAt - startedAt) / 1000);

  const inputTokens = stats?.input_tokens;
  const outputTokens =
    stats?.total_output_tokens != null && stats.total_output_tokens > 0
      ? stats.total_output_tokens
      : estimateTokens(content);
  const totalTokens =
    inputTokens != null ? inputTokens + outputTokens : undefined;

  const timeToFirstToken =
    (stats?.time_to_first_token_seconds != null &&
    stats.time_to_first_token_seconds > 0
      ? stats.time_to_first_token_seconds
      : undefined) ??
    (stats?.time_to_first_token != null && stats.time_to_first_token > 0
      ? stats.time_to_first_token
      : undefined) ??
    (firstTokenAt != null ? (firstTokenAt - startedAt) / 1000 : 0);

  const serverGenerationTime =
    stats?.generation_time != null && stats.generation_time > 0
      ? stats.generation_time
      : stats?.tokens_per_second != null &&
          stats.tokens_per_second > 0 &&
          outputTokens > 0
        ? outputTokens / stats.tokens_per_second
        : undefined;

  const clientGenerationTime =
    firstTokenAt != null
      ? Math.max((completedAt - firstTokenAt) / 1000, 0.001)
      : Math.max(totalTime, 0.001);

  const generationTime = serverGenerationTime ?? clientGenerationTime;

  const tokensPerSecond =
    stats?.tokens_per_second != null && stats.tokens_per_second > 0
      ? stats.tokens_per_second
      : serverGenerationTime != null && outputTokens > 0
        ? outputTokens / serverGenerationTime
        : generationTime > 0 && outputTokens > 0
          ? outputTokens / generationTime
          : 0;

  return {
    tokensPerSecond,
    timeToFirstToken,
    generationTime,
    totalTime,
    outputTokens,
    inputTokens,
    totalTokens,
    stopReason: stats?.stop_reason,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  return `${seconds.toFixed(1)}s`;
}

export function formatTokensPerSecond(tps: number): string {
  if (tps >= 100) return `${Math.round(tps)} tok/s`;
  if (tps >= 10) return `${tps.toFixed(1)} tok/s`;
  return `${tps.toFixed(2)} tok/s`;
}
