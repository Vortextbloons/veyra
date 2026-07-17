# Research Source Types

From `src/modules/research/research-types.ts`:

| Type | Description |
|------|-------------|
| `webpage` | General web page |
| `pdf` | PDF document |
| `news` | News article |
| `docs` | Documentation site |
| `github` | GitHub repository/code |
| `wikipedia` | Wikipedia article |
| `forum` | Forum discussion |
| `package` | Software package (npm, pip, etc.) |
| `youtube` | YouTube video |
| `arxiv` | ArXiv paper |
| `epub` | EPUB ebook |
| `docx` | Word document |
| `pptx` | PowerPoint presentation |
| `xlsx` | Excel spreadsheet |
| `unknown` | Unclassified source |

## Source Quality Scoring

Sources are scored on credibility using `src/modules/research/source-credibility.ts` and `src/modules/research/source-quality.ts` considering:
- Domain authority
- Publication recency
- Content depth and structure
- Citation presence

## Source Statuses

| Status | Description |
|--------|-------------|
| `discovered` | Found via search but not yet fetched |
| `fetched` | Content downloaded |
| `read` | Content extracted and parsed |
| `failed` | Fetch or extraction failed |
| `skipped` | Intentionally bypassed |
