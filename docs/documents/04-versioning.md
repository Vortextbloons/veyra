# Document Versioning

Each document maintains a version history that provides undo capability and change tracking.

## Version Snapshots

- Pre/post version snapshots are created for each AI mutation
- Each save creates a new version entry
- Change source is tracked: `user`, `assistant`, or `system`

## Version Record

```typescript
interface DocumentVersion {
  id: string
  documentId: string
  content: string
  changeSource: 'user' | 'assistant' | 'system'
  createdAt: number
}
```

## Undo

The version history enables undo capability for AI edits, allowing users to roll back to previous versions of a document.
