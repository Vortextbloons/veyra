# Conversation Storage

## Encryption

- Conversations are encrypted with **AES-GCM** using keys from the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
- Encryption keys are managed securely via Tauri
- Legacy key migration is supported on startup

## Persistence

- Debounced saves (500ms) to avoid excessive I/O
- Stored in `%APPDATA%/com.veyra.app/` as JSON files
- Key rotation is supported

## Conversation Identity

Conversations preserve character identity snapshots even if the character is later deleted or renamed, ensuring chat history remains coherent.

## File Format

Each conversation is serialized as an encrypted JSON file containing:
- Messages array with content, reasoning, tool calls, and web search state
- Metadata (title, mode, character binding, project binding, timestamps)
- Conversation summary (if auto-summarized)
