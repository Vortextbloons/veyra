# Character Context Injection

When a character is active, the system prompt includes these XML blocks:

1. **`<veyra_character>`** — Persona block (name, description, personality, scenario)
2. **`<veyra_character_system>`** — System prompt override (if provided)
3. **`<veyra_character_examples>`** — Few-shot examples (if enabled)
4. **`<veyra_lorebook>`** — Matched lorebook entries
5. **Post-history instructions** — Instructions after chat history

## Context Size Limits

Total character context is soft-capped at **16,000 characters** with truncation to prevent overflow of the model's context window.

## Conditional Inclusion

- System prompt override only included if the character defines one
- Few-shot examples only included if `includeExamples` is enabled in chat defaults
- Lorebook block only included if triggered entries exist
