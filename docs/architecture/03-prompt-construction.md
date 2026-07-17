# Prompt Construction

The system prompt is assembled from ~10 XML-tagged blocks. Each block is conditionally included based on the current state.

```
<veyra_core>        — Base AI identity and behavior
<veyra_project>     — Active project context
<veyra_character>   — Character persona
<veyra_context>     — Date, time, platform
<veyra_documents>   — Document tool instructions
<veyra_memory>      — Retrieved memory nodes
<veyra_conversation_summary>  — Summary of older turns
<veyra_tools>       — Available tool definitions
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/prompts.ts` | Prompt construction and assembly |
| `src/modules/chat/chat-context-builder.ts` | Context block assembly |
