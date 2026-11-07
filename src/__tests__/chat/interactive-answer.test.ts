import { describe, expect, it } from "vitest";
import { normalizeInteractiveAnswer } from "@/modules/chat/interactive-answer";
import { exampleComparison, exampleShoppingList, exampleSteps } from "@/modules/chat/ui/prompt";
import { INTERACTIVE_ANSWER_PROMPT } from "@/modules/chat/ui/generated";
import { INTERACTIVE_ANSWER_SCHEMA } from "@/modules/chat/ui/generated-schema";
import { library } from "@/modules/chat/ui/library";
import { promptOptions } from "@/modules/chat/ui/prompt";
import { validateProgram } from "@/modules/chat/ui/validate";

const program = `root = Col([title, body])
title = Title("Hello", "xl")
body = Text("A short line.")`;

describe("interactive answer programs", () => {
  it("accepts a valid openui-lang program", () => {
    const result = normalizeInteractiveAnswer({ program, title: "Greeting" }, "id-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.version).toBe(2);
    expect(result.answer.program).toBe(program);
    expect(result.answer.title).toBe("Greeting");
  });

  it("rejects payloads without a program", () => {
    const result = normalizeInteractiveAnswer({ title: "Nothing" }, "id-1");
    expect(result.ok).toBe(false);
  });

  it("rejects legacy kind-based payloads", () => {
    const result = normalizeInteractiveAnswer({ version: 1, kind: "chart", title: "Old" }, "id-1");
    expect(result.ok).toBe(false);
  });

  it("rejects a program without a root", () => {
    const result = validateProgram('title = Title("Only a title", "xl")');
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown component", () => {
    const result = validateProgram('root = Col([Sparkle("hi")])');
    expect(result.ok).toBe(false);
  });

  it("reports unsupported Stack as the cause rather than a missing root", () => {
    const result = validateProgram('root = Stack([title])\ntitle = Title("Trigonometry")');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Stack is not supported");
    expect(result.error).toContain("Col([...])");
    expect(result.error).not.toContain("no renderable root");
    expect(result.error).not.toContain("they are dropped");
    expect(validateProgram('root = Col([title])\ntitle = Title("Trigonometry")').ok).toBe(true);
  });

  it("rejects an undefined reference", () => {
    const result = validateProgram("root = Col([title, missing])");
    expect(result.ok).toBe(false);
  });

  it("rejects markdown fences", () => {
    const result = validateProgram("```\n" + program + "\n```");
    expect(result.ok).toBe(false);
  });

  it("rejects an incomplete program", () => {
    const result = validateProgram('root = Col([Title("Cut off');
    expect(result.ok).toBe(false);
  });
});

describe("prompt examples", () => {
  for (const [name, example] of Object.entries({
    shoppingList: exampleShoppingList,
    comparison: exampleComparison,
    steps: exampleSteps,
  })) {
    it(`parses the ${name} example`, () => {
      const result = validateProgram(example);
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
    });
  }
});


describe("generated interactive answer artifacts", () => {
  it("match the component library (run npm run prompt:ui if this fails)", () => {
    expect(library.prompt(promptOptions)).toBe(INTERACTIVE_ANSWER_PROMPT);
    expect(library.toJSONSchema()).toEqual(INTERACTIVE_ANSWER_SCHEMA);
  });

  it("documents the components and functions the renderer actually has", () => {
    expect(INTERACTIVE_ANSWER_PROMPT).toContain("root = Col(...)");
    expect(INTERACTIVE_ANSWER_PROMPT).toContain("Slider");
    expect(INTERACTIVE_ANSWER_PROMPT).toContain("Chart");
    expect(INTERACTIVE_ANSWER_PROMPT).toContain("@Format");
    expect(INTERACTIVE_ANSWER_PROMPT).toContain("@Set");
  });
});
