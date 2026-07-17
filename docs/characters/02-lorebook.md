# Lorebook System

Lorebook entries provide contextual knowledge that's injected into the chat when triggered by keyword matches.

## Entry Fields

| Field | Description |
|-------|-------------|
| `keys` | Trigger keywords |
| `matchType` | `any` (OR), `all` (AND), or `regex` |
| `content` | Knowledge content to inject |
| `priority` | 1-5 (higher = more important) |
| `constant` | Always included (ignores keyword matching) |
| `selective` | Only included when keywords match |
| `insertionOrder` | Ordering within the lorebook block |
| `probability` | Roll chance (0-100%) for non-constant entries |
| `position` | `before` or `after` the character block |

## How Lorebook Works

1. The engine scans trailing messages for keyword matches
2. Matches are filtered by probability rolls
3. Entries are sorted by priority, then insertion order
4. Results are capped at `maxLorebookEntries` (default from chat defaults)
5. Matched entries are injected into `<veyra_lorebook>` block

## Scan Depth

Controls how many recent messages are scanned for keyword matches (configurable per character). Higher values include more context but may trigger more entries.
