import { listMemoryNodes, updateMemoryNode } from "@/modules/memory/memory-storage";
import { isProtectedMemory, type MemoryNode } from "@/modules/memory/memory-types";

const EPHEMERAL_TTL_DAYS = 7;
const LOW_PRIORITY_MIN_AGE_DAYS = 14;
const MAX_LOW_PRIORITY_GLOBAL = 200;
const MAX_LOW_PRIORITY_PER_PROJECT = 100;
const MAX_LOW_PRIORITY_PER_CONVERSATION = 30;

export type MemoryRetentionResult = {
  archivedExpired: number;
  archivedOverflow: number;
};

function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function timeValue(iso?: string): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isLive(node: MemoryNode): boolean {
  return node.status !== "archived" && node.status !== "rejected";
}

function isNotArchived(node: MemoryNode): boolean {
  return node.status !== "archived";
}

function isLowPriority(node: MemoryNode): boolean {
  return node.priority === "low" || node.priority === "ephemeral" || node.importance <= 2;
}

function isOldEnoughForLowCleanup(node: MemoryNode): boolean {
  return timeValue(node.createdAt) <= daysAgo(LOW_PRIORITY_MIN_AGE_DAYS);
}

function shouldExpire(node: MemoryNode): boolean {
  if (isProtectedMemory(node) || !isLive(node)) return false;
  if (node.expiresAt && timeValue(node.expiresAt) > 0) return timeValue(node.expiresAt) <= Date.now();
  if (node.priority === "ephemeral" || node.type === "temporary_context") {
    return timeValue(node.createdAt) <= daysAgo(EPHEMERAL_TTL_DAYS);
  }
  return false;
}

function cleanupSort(a: MemoryNode, b: MemoryNode): number {
  if (a.status !== b.status) {
    if (a.status === "rejected") return -1;
    if (b.status === "rejected") return 1;
  }
  if (Boolean(a.duplicateOf) !== Boolean(b.duplicateOf)) return a.duplicateOf ? -1 : 1;
  if ((a.confidence < 0.4) !== (b.confidence < 0.4)) return a.confidence < 0.4 ? -1 : 1;
  if (a.useCount !== b.useCount) return a.useCount - b.useCount;
  const aUsed = timeValue(a.lastUsedAt) || timeValue(a.updatedAt) || timeValue(a.createdAt);
  const bUsed = timeValue(b.lastUsedAt) || timeValue(b.updatedAt) || timeValue(b.createdAt);
  return aUsed - bUsed;
}

function overflow(nodes: MemoryNode[], cap: number): MemoryNode[] {
  if (nodes.length <= cap) return [];
  return nodes.slice().sort(cleanupSort).slice(0, nodes.length - cap);
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = out.get(key) ?? [];
    list.push(item);
    out.set(key, list);
  }
  return out;
}

async function archiveNodes(nodes: MemoryNode[]): Promise<number> {
  const unique = Array.from(new Map(nodes.map((node) => [node.id, node])).values());
  await Promise.allSettled(unique.map((node) => updateMemoryNode({ id: node.id, status: "archived" })));
  return unique.length;
}

export async function runMemoryRetentionCleanup(): Promise<MemoryRetentionResult> {
  const nodes = await listMemoryNodes({ limit: 5000 });
  const expired = nodes.filter(shouldExpire);
  const protectedIds = new Set(expired.map((node) => node.id));

  const lowCandidates = nodes.filter(
    (node) =>
      !protectedIds.has(node.id) &&
      !isProtectedMemory(node) &&
      isNotArchived(node) &&
      isLowPriority(node) &&
      isOldEnoughForLowCleanup(node),
  );

  const overflowNodes: MemoryNode[] = [];
  overflowNodes.push(
    ...overflow(
      lowCandidates.filter((node) => node.scope === "global" && !node.projectId && !node.conversationId),
      MAX_LOW_PRIORITY_GLOBAL,
    ),
  );

  for (const projectNodes of groupBy(
    lowCandidates.filter((node) => Boolean(node.projectId)),
    (node) => node.projectId ?? "",
  ).values()) {
    overflowNodes.push(...overflow(projectNodes, MAX_LOW_PRIORITY_PER_PROJECT));
  }

  for (const conversationNodes of groupBy(
    lowCandidates.filter((node) => Boolean(node.conversationId)),
    (node) => node.conversationId ?? "",
  ).values()) {
    overflowNodes.push(...overflow(conversationNodes, MAX_LOW_PRIORITY_PER_CONVERSATION));
  }

  const archivedExpired = await archiveNodes(expired);
  const archivedOverflow = await archiveNodes(overflowNodes);
  return { archivedExpired, archivedOverflow };
}
