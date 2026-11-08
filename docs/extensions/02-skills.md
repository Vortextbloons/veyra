# Skills

A Skill is a reusable Markdown instruction set the user can apply to a request. A Skill tells the AI
how to approach a task. It never runs code, changes permissions, or activates itself.

Skills follow the [Agent Skills](https://agentskills.io/specification) shape: a directory containing
`SKILL.md` with `name` and `description` frontmatter, followed by instructions. A Veyra-specific
manifest is not required.

## The model

Three fields carry all the meaning:

| Field | Purpose |
|---|---|
| `name` | Display name and the `/<slug>` identifier in the composer |
| `description` | When the AI should use the Skill — this is the routing signal |
| `instructions` | The Markdown body the model follows |

`id` and `contentHash` are internal. The ID is stable across edits so an existing chat keeps working;
the hash changes whenever the content does, which is what makes a request's record verifiable.

Workflows and capability declarations from older manifests are optional legacies, not part of a Skill
anymore. Imports keep them as `legacyWorkflows` so each one can be converted into a standalone Skill
or dropped.

## Where a Skill runs

Veyra decides which Skills a request uses, then sends their instructions with that request:

1. The library stores the Skill and its content hash.
2. On send, the request's Skills are resolved and snapshotted onto the user message
   (`SkillInvocation[]` on the event and on the saved `ChatMessage`).
3. `materialize_pi_skills` writes each Skill to
   `<app data>/extensions/pi-skills/<slug>/SKILL.md`, copying supporting files from the imported
   package snapshot.
4. Those directories are passed to Pi as `--skill` paths, so Pi resolves supporting files through its
   own `read` tool.
5. The recorded instructions are included in the request prompt inside a `<skill>` block. Veyra sends
   the snapshot rather than letting Pi re-read the file, so the instructions that run are always the
   ones recorded with the request, even after an edit.

Materialized folders carry `disable-model-invocation: true`. Pi will not advertise or auto-load them;
Veyra is the only thing that selects a Skill. Model selection happens through Veyra's own `use_skill`
tool instead, so the catalogue, the access rules, and the record stay in one place. This is what keeps
automatic selection an explicit, user-controlled feature rather than an accident of Pi's discovery.

## Invoking a Skill

- **One message:** type `/` in the composer, pick a Skill. It appears as a chip marked
  "This message", keeps any text already typed, and clears after sending.
- **Whole chat:** use **Pin** on that chip, or the Chat settings panel, to promote it. Pinned Skills
  get a distinct chip and stay until removed.
- Invoking a Skill once never changes the rest of the chat.

## Who can apply a Skill

Two separate questions, with separate controls:

| | Question | Control |
|---|---|---|
| Manual use | Can the user apply this Skill? | The Skill is enabled |
| Model use | May the model load this Skill on its own? | Library default plus a per-Skill override |

**Manual use is always available for an enabled Skill.** The model controls never restrict the user.

For model use there is one library-wide default, **Let the model choose Skills**, and each Skill can
override it in either direction:

| Skill setting | Default off | Default on |
|---|---|---|
| `auto` (Model may use) | model can load it | model can load it |
| `manual` (Manual only) | model cannot load it | model cannot load it |
| unset (follows default) | model cannot load it | model can load it |

The default starts **off**, so installing a Skill never starts steering the chat. The usual setup is
to turn the default on and set the few Skills you want to keep for yourself to Manual only.

When the model may use a Skill, its name and description appear in the prompt as an
`<available_skills>` catalogue and a `use_skill` tool is registered. The model asks for the Skill by
slug and receives the instructions then. Bodies stay out of the prompt until they are needed, and the
composer picker marks such Skills with a small `model` badge.

Access is re-checked when the model asks for a Skill, so disabling a Skill or switching it to manual
mid-request takes effect immediately. A loaded Skill gets the same framing as one the user applied,
including the note that it cannot override Veyra policy or tool permissions.

## Library operations

Create, edit, duplicate, delete, import, and export live in **Settings → Skills**. The editor is a
Markdown textarea plus the name and description. Generated Skills use the same `SKILL.md` format.

Imports accept a folder or ZIP containing `SKILL.md`. A ZIP that wraps everything in one folder is
unwrapped automatically. Exports write `<slug>/SKILL.md` plus supporting files as a portable ZIP.

## Records and retry

A request's record holds each Skill's ID, content hash, and the instruction snapshot. Editing or
deleting a Skill never changes it. **Retry** on a user turn replays the stored record rather than
current library content, so it repeats the original instructions. A request that used no Skill retries
with none.

## Migration

Older builds stored Skills inside the `veyra.extensions.v1` key with `workflows`,
`requestedCapabilities`, and a single per-chat `activeSkillIds` entry.

- Installed instructions are preserved, including disabled state.
- Each old chat selection becomes an explicit chat-scoped Skill, which is the new model's equivalent.
- Workflows and capability lists move to `legacyWorkflows` and `legacyCapabilities`.
- The MCP store parks the old payload under `veyra.skills.legacy.v1` before rewriting its own key;
  `importLegacySkillsOnce()` merges it into the library once at startup and never overwrites a
  selection the user made after upgrading.

## Key files

| File | Purpose |
|---|---|
| `src/modules/extensions/skill-runtime.ts` | Parsing, validation, hashing, request prompt blocks |
| `src/modules/extensions/skills-store.ts` | Library state and the two selection scopes |
| `src/modules/extensions/skills-migration.ts` | Legacy payload conversion |
| `src/modules/extensions/components/skill-editor.tsx` | Markdown editor and `SKILL.md` preview |
| `src/modules/extensions/components/skill-chip.tsx` | Composer chips and the Pin action |
| `src/components/settings/skills-library-settings.tsx` | Settings → Skills |
| `src-tauri/src/extensions/commands.rs` | Snapshot, materialize, and export commands |

## Verification

`src/modules/extensions/skill-runtime.test.ts`, `skills-store.test.ts`, and `skills-migration.test.ts`
cover the format, validation, duplicate names, selection scopes, and legacy conversion.
`src/__tests__/agents/agent-skill-invocation.test.ts` covers what reaches Pi, the one-request versus
persistent split, and retry after edit or deletion.

## Not in this version

Nothing further is planned for Skill selection beyond the controls above; the library default plus a
per-Skill override covers "let the model choose everything" and "keep these few for me".
