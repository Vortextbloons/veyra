# Character Import/Export

## Export Formats

| Format | Description |
|--------|-------------|
| Veyra JSON | Native Veyra format with all fields preserved |
| Character Card V3 JSON | Standard CCv3 format (SillyTavern compatible) |
| Character Card V3 PNG | PNG with embedded CCv3 metadata chunk |

## Import

- Import from Veyra JSON or Character Card V3 JSON
- PNG cards with CCv3 metadata chunks are also supported
- Fields are mapped from CCv3 spec to Veyra's internal model

## AI-Assisted Creation

The `ai-assist/` module provides:
- Describe a character and the AI generates the full record
- AI generates lorebook entries from descriptions
- Tone and style suggestion for personality fields
- Character descriptions from CCv3 card parsing
