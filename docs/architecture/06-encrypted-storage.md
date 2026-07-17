# Encrypted Storage

## Conversation Encryption

- AES-GCM encryption with authenticated snapshot revisions
- Encryption keys stored in the operating-system credential vault
- Web Workers handle encryption/decryption without blocking the UI
- Debounced saves (500ms) to avoid excessive I/O
- Atomic primary writes with one rotating backup
- Emergency browser storage is revision-compared rather than blindly preferred

## Key Management

- The OS credential vault is the only source of truth for new keys
- Legacy `conversation.key` files are migrated into the vault and removed
- Legacy deterministic-key snapshots remain decryptable only for migration
- If no copy can be decrypted, writes are blocked to preserve recovery data

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/conversation-storage.ts` | Encrypted conversation persistence |
| `src/lib/document-storage.ts` | Document storage abstraction |
