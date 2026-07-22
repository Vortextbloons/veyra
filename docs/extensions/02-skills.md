# Skills

Skills are local, reviewed Markdown instruction packages (SKILL.md) that guide the AI chat behavior. They are declarative only — they cannot execute code, modify permissions, or self-activate.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/extensions/skill-runtime.ts` | Validation, `draftToSkill` conversion, context block builder |
| `src/modules/extensions/skill-generator.ts` | AI-powered skill draft generation via the provider |
| `src/modules/extensions/extension-types.ts` | `SkillRecord`, `SkillDraft`, `SkillValidation`, `SkillWorkflow` |
| `src/modules/extensions/capability-catalog.ts` | Lists `WorkflowCapability` entries from installed skills |
| `src/modules/extensions/components/skill-selector.tsx` | Composer dropdown to pick a skill/workflow |
| `src/modules/extensions/components/project-skills-settings.tsx` | Project-scoped skill and MCP server enable/disable |
| `src/components/settings/extensions-settings.tsx` | Settings page for importing, generating, and managing skills |

## SKILL.md Format

A skill package is a directory (or ZIP archive) containing at minimum a `SKILL.md` at its root:

```markdown
# Skill Name

Declarative instructions for the AI model.
```

Optional files:

- `veyra.json` — Manifest with `id`, `version`, `description`, `requiredCapabilities`, and `workflows`.
- Any relative-path assets (SVG, text, etc.) referenced from the manifest.

### SKILL.md Frontmatter

Skills can include YAML frontmatter between `---` delimiters:

```markdown
---
name: Release Notes
description: Writes concise release notes
version: 2.0.0
---

Write release notes in a brief, scoped format.
```

### veyra.json

```json
{
  "id": "skill.release-notes",
  "version": "2.0.0",
  "description": "Release notes generator",
  "requiredCapabilities": ["mcp.github.create_issue"],
  "workflows": [
    {
      "id": "brief",
      "name": "Brief",
      "instructions": "Use three bullets only."
    }
  ],
  "prompts": ["prompts/template.md"],
  "resources": ["assets/example.txt"]
}
```

## Validation Rules

- SKILL.md must not exceed 60,000 characters.
- No executable activation hooks (`onInstall`, `onActivate`, `postinstall`, `preinstall`) are permitted.
- Code blocks are retained as instruction text only and will never execute.
- Package imports reject symbolic links, path traversal, and files over 512 KB.
- SVG assets are scanned for active content (`<script>`, `onload=`, etc.).
- Total package limit: 5 MB, 200 files.

## Import Methods

| Method | Tauri Command | Source |
|--------|--------------|--------|
| Folder import | `snapshot_skill_directory` | User-selected directory |
| ZIP import | `snapshot_skill_zip` | User-selected ZIP archive |
| AI generation | `generateSkillDraft` | Provider generates a draft from a description |

## Skill Context Injection

When a skill is active for a chat, the orchestrator injects a `<veyra_active_skill>` context block into the system prompt containing the skill instructions and optional workflow instructions.

## Skill Snapshots

Each user message records its active skill as a `skillSnapshot` (`{ id, version, workflowId? }`). The orchestrator resolves the snapshot against the installed skills at response time, ensuring skill versions stay consistent across a conversation.
