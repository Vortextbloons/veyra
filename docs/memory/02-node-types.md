# Memory Node Types

## Node Types

| Type | Description |
|------|-------------|
| `preference` | User preferences and habits |
| `project` | Project-level information |
| `project_fact` | Factual project details |
| `decision` | Decisions made during conversation |
| `instruction` | User instructions for the AI |
| `summary` | Conversation summaries |
| `task` | Tasks and to-dos |
| `idea` | Ideas and brainstorming |
| `file_reference` | References to files |
| `temporary_context` | Short-lived contextual info |

## Priorities

| Priority | Description |
|----------|-------------|
| `permanent` | Never auto-archived |
| `high` | Rarely evicted |
| `medium` | Standard retention |
| `low` | Evicted when over capacity |
| `ephemeral` | 7-day TTL, first to be evicted |

## Scopes

| Scope | Description |
|-------|-------------|
| `global` | Available across all conversations |
| `project` | Scoped to a specific project |
| `conversation` | Scoped to a single conversation |
| `session` | Ephemeral, current session only |

## Protected Memories

The following are never auto-archived:
- Pinned memories
- Permanent priority
- Importance >= 5
- Explicit user saves
- Manual edits
- Profile setup nodes
