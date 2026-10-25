# Conversation Storage

## Encryption

- Conversations are encrypted with **AES-GCM** and authenticated snapshot revisions
- Web Workers handle encryption/decryption without blocking the UI
- Encryption keys live in the operating-system credential vault
- Legacy plaintext key files are migrated to the vault and removed on startup

## Persistence

- Debounced saves (500ms) to avoid excessive I/O
- Atomic primary writes retain one rotating encrypted backup
- An emergency browser copy is compared by authenticated revision during recovery
- Failed recovery blocks writes and displays a persistent warning

## Conversation Identity

Conversations preserve character identity snapshots even if the character is later deleted or renamed, ensuring chat history remains coherent.

## File Format

Each conversation is serialized as an encrypted JSON file containing:
- Messages array with content, reasoning, tool calls, and web search state
- Metadata (title, mode, character binding, project binding, timestamps)
- Conversation summary (if auto-summarized)
