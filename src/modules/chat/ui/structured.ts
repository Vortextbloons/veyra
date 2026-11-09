import { INTERACTIVE_ANSWER_SCHEMA } from "./generated-schema";

/** Compile named JSON properties to the existing renderer contract. Never evaluate code. */
export function prepareProgram(source: string): string {
  let text = source.replace(/^\uFEFF/, "").trim();
  const fence = /^```(?:json|openui|openui-lang)?\s*\n([\s\S]*?)\n```$/.exec(text);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) return text;
  const document: unknown = JSON.parse(text);
  const defs = INTERACTIVE_ANSWER_SCHEMA.$defs as Record<string, { properties?: Record<string, unknown> }>;
  let count = 0;
  function encode(value: unknown, depth = 0): string {
    if (depth > 60 || ++count > 10000) throw new Error("Structured answer is too deeply nested or too large.");
    if (Array.isArray(value)) return `[${value.map(v => encode(v, depth + 1)).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (Object.hasOwn(obj, "$expr")) {
        if (Object.keys(obj).length !== 1 || typeof obj.$expr !== "string" || /[\r\n;]/.test(obj.$expr)) throw new Error("$expr must contain one OpenUI expression.");
        return `(${obj.$expr})`;
      }
      if (typeof obj.type === "string") {
        if (!Object.hasOwn(defs, obj.type)) throw new Error(`Unknown component "${obj.type}". Use a catalog component such as Text.`);
        const keys = Object.keys(defs[obj.type].properties ?? {});
        for (const key of Object.keys(obj)) if (key !== "type" && !keys.includes(key)) throw new Error(`${obj.type}: unknown property "${key}". Allowed: ${keys.join(", ")}.`);
        const last = keys.reduce((n, key, i) => Object.hasOwn(obj, key) ? i : n, -1);
        return `${obj.type}(${keys.slice(0, last + 1).map(key => Object.hasOwn(obj, key) ? encode(obj[key], depth + 1) : "null").join(",")})`;
      }
      return `{${Object.entries(obj).map(([k,v]) => `${JSON.stringify(k)}:${encode(v, depth + 1)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Expected a component or {root, state} document.");
  const doc = document as Record<string, unknown>;
  if (Object.hasOwn(doc, "type")) return `root = Col([${encode(doc)}])`;
  if (!doc.root || Object.keys(doc).some(k => k !== "root" && k !== "state")) throw new Error("Structured document accepts only root and optional state.");
  const lines = [`root = Col([${encode(doc.root)}])`];
  if (doc.state !== undefined) {
    if (!doc.state || typeof doc.state !== "object" || Array.isArray(doc.state)) throw new Error("state must be an object of literal defaults.");
    for (const [name, value] of Object.entries(doc.state)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid state name.");
      lines.push(`$${name} = ${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
}
