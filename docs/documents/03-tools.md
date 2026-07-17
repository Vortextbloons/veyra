# Document AI Tools

Documents are accessible via 3 chat tools. These tools allow the AI to programmatically read, create, and update documents.

## `doc_read`

Reads a document by ID. Optionally includes version history.

```json
{
  "documentId": "string",
  "includeVersions": false
}
```

## `doc_create`

Creates a new document. Can be scoped to a conversation or project.

```json
{
  "title": "string",
  "content": "string",
  "type": "document",
  "conversationId": "optional",
  "projectId": "optional"
}
```

## `doc_update`

Updates an existing document with selective mutation modes.

```json
{
  "documentId": "string",
  "updateMode": "replace_all | replace_section | insert_after_section | replace_text",
  "targetSection": "optional heading text",
  "newContent": "string"
}
```

## Update Modes

| Mode | Description |
|------|-------------|
| `replace_all` | Replace entire document content |
| `replace_section` | Replace a section by heading |
| `insert_after_section` | Insert content after a section |
| `replace_text` | Replace specific text |
