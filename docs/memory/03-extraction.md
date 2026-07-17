# Memory Extraction

Extraction happens post-chat, using the LLM to identify memory-worthy content from the conversation transcript.

## Pipeline

1. `shouldExtractMemoryBatch()` checks if enough new messages exist (min 4 messages, 2 exchanges)
2. `runMemoryExtractionBatch()` sends the transcript to the LLM
3. LLM outputs JSON with memory candidates
4. Deduplication: text similarity + optional vector similarity against existing memories
5. High-confidence items are auto-saved; others require review
6. Batch size capped at 16 messages; 90-second pending threshold

## Extraction Modes

The extraction behavior varies by memory mode:
- **safe_auto_save**: Only high-confidence extractions are saved automatically
- **review_all**: All extractions are saved but require manual review
- **aggressive_project_memory**: Maximum batch size and lower confidence thresholds

## AI Job Scheduling

Memory extraction runs as a background job (priority 3) via the AI job scheduler, ensuring it never blocks user chat.
