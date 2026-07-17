# Memory Retrieval

Retrieval runs pre-chat to find relevant memories for the current conversation context.

## Pipeline

1. `memory-router.ts` detects if memory retrieval is needed (looks for cues like "remember", "my name", etc.)
2. Skips greetings, trivial math, and very short messages
3. `buildMemoryPackWithInfo()` searches for candidates:
   - **Durable seeds**: High-priority pinned/permanent memories
   - **Vector search**: Optional semantic similarity (requires external endpoint)
   - **Keyword search**: BM25-style keyword matching
4. Multi-factor scoring:
   - Keyword match score
   - Importance and confidence ratings
   - Pinned boost
   - Recency and use-count boosts
   - Project and category alignment
   - Profile-aware boosting
5. Noise floor filtering removes low-relevance candidates
6. Binary search trims results to fit within the token budget

## Scoring Factors

Each candidate memory receives a composite score considering:
- Text similarity to the user's message
- Memory importance and confidence
- Whether the memory is pinned
- Recency of the memory
- Project and category alignment with current context
