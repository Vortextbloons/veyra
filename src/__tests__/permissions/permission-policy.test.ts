import { describe, expect, it } from "vitest";
import {
  buildPermissionRequest,
  canonicalArgs,
  describeInvocation,
  fingerprintBinding,
  invocationBinding,
  isToolProtected,
} from "@/modules/permissions/permission-policy";

const base = {
  sessionId: "session-a",
  toolCallId: "call-1",
  toolName: "bash",
  args: { command: "npm test" },
  cwd: "C:\\project",
  bridge: "native" as const,
};

describe("permission policy", () => {
  it("protects only the selected tools", () => {
    expect(isToolProtected("bash", ["bash"])).toBe(true);
    expect(isToolProtected("bash", [])).toBe(false);
    expect(isToolProtected("read", ["bash"])).toBe(false);
  });

  it("covers MCP tools through the single MCP entry", () => {
    expect(isToolProtected("mcp__files__write", ["mcp"])).toBe(true);
    expect(isToolProtected("mcp__files__write", ["bash"])).toBe(false);
  });

  it("binds an approval to session, tool, exact arguments, and cwd", () => {
    const binding = invocationBinding(base);
    expect(invocationBinding({ ...base, args: { command: "npm  test" } })).not.toBe(binding);
    expect(invocationBinding({ ...base, args: { command: "npm test; rm -rf ." } })).not.toBe(binding);
    expect(invocationBinding({ ...base, cwd: "C:\\other" })).not.toBe(binding);
    expect(invocationBinding({ ...base, sessionId: "session-b" })).not.toBe(binding);
    expect(invocationBinding({ ...base, toolName: "write" })).not.toBe(binding);
    expect(invocationBinding({ ...base, bridge: "host" })).not.toBe(binding);
  });

  it("is insensitive to key order but not to value order", () => {
    expect(invocationBinding({ ...base, args: { command: "ls", timeout: 5 } }))
      .toBe(invocationBinding({ ...base, args: { timeout: 5, command: "ls" } }));
    expect(invocationBinding({ ...base, args: { files: ["a", "b"] } }))
      .not.toBe(invocationBinding({ ...base, args: { files: ["b", "a"] } }));
  });

  it("drops undefined members so a JSON round trip keeps the same binding", () => {
    const args = { command: "ls", timeout: undefined };
    expect(canonicalArgs(args)).toBe(canonicalArgs(JSON.parse(JSON.stringify(args))));
  });

  it("derives a stable fingerprint from the binding", () => {
    const binding = invocationBinding(base);
    expect(fingerprintBinding(binding)).toBe(fingerprintBinding(binding));
    expect(fingerprintBinding(binding)).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintBinding(invocationBinding({ ...base, args: { command: "ls" } }))).not.toBe(fingerprintBinding(binding));
  });

  it("builds a request id from session and Pi's tool call id", () => {
    const request = buildPermissionRequest({ invocation: base, now: 10 });
    expect(request.id).toBe("session-a:call-1");
    expect(request.binding).toBe(invocationBinding(base));
    expect(request.requestedAt).toBe(10);
    // The binding is internal: the card must not carry it into state.
    expect("binding" in request).toBe(true);
  });

  it("describes a bash call by its command and everything else by its arguments", () => {
    expect(describeInvocation(base)).toBe("npm test");
    expect(describeInvocation({ ...base, toolName: "write", args: { path: "a.ts", content: "x" } }))
      .toBe('{"content":"x","path":"a.ts"}');
  });
});
