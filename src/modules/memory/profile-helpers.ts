import type { MemoryNode } from "@/modules/memory/memory-types";
import { PROFILE_CATEGORIES, TOTAL_PROFILE_QUESTIONS } from "./profile-config";

export function isProfileNode(node: MemoryNode): boolean {
  return (
    node.origin === "profile_setup" ||
    node.tags.some((t) => t.startsWith("profile:"))
  );
}

export function profileNodeForQuestion(
  nodes: MemoryNode[],
  categoryId: string,
  questionIndex: number,
): MemoryNode | undefined {
  const tag = `profile:${categoryId}:${questionIndex}`;
  return nodes.find(
    (n) =>
      n.origin === "profile_setup" &&
      n.tags.includes(tag) &&
      n.status !== "archived",
  );
}

export function calculateProfileCompleteness(nodes: MemoryNode[]): number {
  let answered = 0;
  for (const cat of PROFILE_CATEGORIES) {
    for (let i = 0; i < cat.questions.length; i++) {
      if (profileNodeForQuestion(nodes, cat.id, i)) {
        answered++;
      }
    }
  }
  return TOTAL_PROFILE_QUESTIONS > 0
    ? Math.round((answered / TOTAL_PROFILE_QUESTIONS) * 100)
    : 0;
}

export function buildProfileNodePayload(
  categoryId: string,
  questionIndex: number,
  answer: string,
): {
  tag: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
} {
  const tag = `profile:${categoryId}:${questionIndex}`;
  const category = PROFILE_CATEGORIES.find((c) => c.id === categoryId);
  const question = category?.questions[questionIndex];
  const title = question?.question ?? `Profile: ${categoryId}#${questionIndex}`;
  const summary = answer.replace(/\s+/g, " ").trim().slice(0, 140);

  return {
    tag,
    title,
    content: answer.trim(),
    summary,
    tags: [tag, `profile:${categoryId}`, "profile"],
  };
}
