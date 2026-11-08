# Prompt Construction

Veyra assembles authoritative system instructions separately from retrieved or generated reference context. Each block is conditionally included based on the current state.

```
System message:
Veyra core          — Base AI identity and behavior
<veyra_project>     — Active project context
<veyra_context>     — Date, time, platform

Non-system reference message:
<veyra_conversation_summary>  — Summary of older turns
<veyra_web_search>  — Untrusted web evidence from tool calls
```

Reference material is admitted only when it fits after the system instructions and active conversation. The newest conversation turn is always retained, and older history is included as a contiguous suffix.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/prompts.ts` | Prompt construction and assembly |
| `src/lib/context.ts` | Context budgeting and message assembly |
| `src/modules/agents/agent-session-context.ts` | Session transcript + memory budget composition |
| `src/modules/agents/agent-store.ts` | Final prompt assembly: project guidance, recorded Skill instructions, system prompt |
