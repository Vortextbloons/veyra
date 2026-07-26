# Document AI Tools

Documents are accessible via 3 chat tools. These tools allow the AI to programmatically read, create, and update documents.

## `doc_read`

Reads a document by ID.

```json
{
  "documentId": "string"
}
```

## `doc_create`

Creates a new document.

```json
{
  "title": "string",
  "documentType": "document",
  "contentMarkdown": "string"
}
```

## `inline_edit`

Updates an existing document with selective mutation modes.

```json
{
  "documentId": "string",
  "mode": "replace_all | replace_section | insert_after_section | replace_text",
  "target": "optional heading or exact text",
  "contentMarkdown": "string",
  "explanation": "optional summary"
}
```

## Update Modes

| Mode | Description |
|------|-------------|
| `replace_all` | Replace entire document content |
| `replace_section` | Replace a section by heading |
| `insert_after_section` | Insert content after a section |
| `replace_text` | Replace specific text |

`doc_update` remains a runtime-only alias for compatibility with older model calls. It is not advertised in the tool schema.
