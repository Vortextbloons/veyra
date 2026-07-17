# Group Chat

Multiple characters can share a conversation with manual or automatic speaker selection.

## Group Fields

| Field | Description |
|-------|-------------|
| `name` | Group display name |
| `memberIds` | Array of character IDs |
| `speakerMode` | `manual` (user picks) or `auto` (AI selects) |
| `openingMessage` | Group greeting |
| `activeSpeakerId` | Currently active character |

## Group Chat Flow

1. `startGroupChat()` creates a conversation with the group binding
2. The `activeSpeaker` character responds to each turn
3. **Manual mode**: user selects which character speaks
4. **Auto mode**: AI selects the most appropriate speaker
5. `regenerateGroupGreeting()` swaps the opening message

## Group Context

Each group turn includes the speaker's character block in the prompt, ensuring the AI responds in that character's voice and personality.
