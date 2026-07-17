# Project Architecture

## Project Activation

1. User selects a project from the project list
2. The project becomes the "active project"
3. Its system prompt is injected into every chat turn as `<veyra_project>`
4. Project-specific settings override global settings

## Context Injection

When a project is active, the system prompt includes:

```xml
<veyra_project>
  <name>Project Name</name>
  <description>Project description</description>
  <kind>Project kind</kind>
  <instructions>Custom system prompt from the project</instructions>
</veyra_project>
```

## Scoped Resources

The following resources can be scoped to a project:
- **Conversations**: Chat threads belong to a project
- **Documents**: Documents can be project-specific
- **Memory**: Memory nodes can be project-scoped

## Project Tracking

- `lastOpenedAt` timestamp is updated when a project is opened
- Projects are sorted by recency by default
- Active/archived filtering in the store
