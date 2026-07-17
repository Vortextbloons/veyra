# Encrypted Storage

## Conversation Encryption

- AES-GCM encryption for conversation files
- Encryption keys managed by the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
- Debounced saves (500ms) to avoid excessive I/O

## Key Management

- Keys are stored securely via Tauri
- Legacy key migration on startup
- Key rotation support

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/conversation-storage.ts` | Encrypted conversation persistence |
| `src/lib/document-storage.ts` | Document storage abstraction |
