# Memory Retention

Periodic cleanup and eviction keep the memory system from growing unbounded.

## Eviction Thresholds

| Scope | Max Nodes |
|-------|-----------|
| Global | 200 |
| Per project | 100 |
| Per conversation | 30 |

## Eviction Strategy

1. Expired ephemeral nodes (7-day TTL) are archived first
2. Low-priority nodes are evicted next
3. Least recently accessed nodes within the same priority band are removed

## Protected Memories

See `02-node-types.md` for the full protected memory list. Key protections:
- Pinned and permanent memories are never evicted
- Importance >= 5 is immune
- User-explicit saves and manual edits are preserved

## Scheduling

Retention runs as a maintenance job (priority 4) during idle scheduler time.
