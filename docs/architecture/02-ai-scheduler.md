# AI Job Scheduler

Central scheduler (`src/lib/ai-scheduler.ts`) manages all AI tasks with priority-based queueing.

## Job Types (9 total)

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
| `research_run` | 1 | Research pipeline execution |
| `auto_name_chat` | 2 | Auto-generate conversation titles |
| `character_ai_assist` | 2 | AI-assisted character creation |
| `summarize_chat` | 3 | Conversation summarization |
| `extract_memory` | 3 | Memory extraction from chat |
| `compress_context` | 3 | Context compression |
| `maintenance` | 4 (lowest) | Background cleanup |

## Priority Levels

| Level | Category |
|-------|----------|
| 0 | User-facing (highest priority) |
| 1 | Important background tasks |
| 2 | Standard background tasks |
| 3 | Low-priority background tasks |
| 4 | Maintenance (lowest) |

## Behavior

- Jobs are queued and executed in priority order
- User chat always takes priority
- Background jobs run when the scheduler is idle
- Abort support for cancellable jobs
