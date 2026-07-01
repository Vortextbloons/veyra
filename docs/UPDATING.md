# Updating Documentation

Guide for keeping docs in sync with code changes.

## Quick Reference

| Task | Command |
|------|---------|
| Combine all docs | `npm run docs:combine` |
| Find outdated type references | See [Detecting Drift](#detecting-drift) |
| Add a new feature doc | See [Adding New Docs](#adding-new-docs) |
| Update after a code change | See [Update Workflow](#update-workflow) |

## Structure

```
docs/
  <feature>/
    README.md       ← one file per feature
  VEYRA_FULL_DOCS.md  ← generated, never edit directly
```

Each `README.md` covers: purpose, key files, types, how it works, and important details.

---

## Detecting Drift

When code changes, docs can go stale. Here's how to catch it.

### 1. Changed Types

If types changed, the docs type sections are likely outdated.

```powershell
# Find all type definitions in a module
rg "^export (type|interface)" src/modules/<module>/

# Compare against what the doc lists
rg "<type-name>" docs/<module>/README.md
```

### 2. Changed File Structure

If files were added, removed, or renamed, the "Key Files" table is stale.

```powershell
# List current files in a module
ls src/modules/<module>/

# Compare against the doc's file table
rg "^\| " docs/<module>/README.md | Select-String "src/"
```

### 3. Changed Function Signatures

If public functions changed parameters or return types, update the "How It Works" section.

```powershell
# Find exported functions in a module
rg "^export (function|const|async function)" src/modules/<module>/
```

### 4. New Dependencies

If `package.json` gained new deps relevant to a feature, mention them in the overview doc.

### 5. New Tauri Commands

If `src-tauri/src/` gained new `#[tauri::command]` functions, update the relevant doc's IPC table.

```powershell
# Find all Tauri commands
rg "#\[tauri::command\]" src-tauri/src/
```

---

## Update Workflow

After making a code change:

### Step 1: Identify Affected Docs

Run this to see which module you changed:

```powershell
# What module was modified?
rg "from.*modules/<module>" src/ --files-with-matches
```

Then open the matching `docs/<module>/README.md`.

### Step 2: Update the Affected Section

| What changed | What to update |
|-------------|---------------|
| New/removed file | Key Files table |
| New/renamed type | Key Types section |
| New/changed function | How It Works section |
| New Tauri command | Tauri IPC Commands table |
| New tool parameter | Tool integration section |
| Changed defaults | Defaults/constants section |

### Step 3: Add the Change Source

At the top of the updated doc, add a changelog entry:

```markdown
## Changelog

- **2026-06-22**: Updated for [brief description of change]
```

Keep only the last 5 entries. Remove older ones.

### Step 4: Rebuild Combined Docs

```powershell
npm run docs:combine
```

---

## Adding New Docs

When adding a new feature module:

### 1. Create the Folder

```
docs/<feature-name>/README.md
```

Use lowercase, hyphen-separated names matching the `src/modules/` directory.

### 2. Use This Template

```markdown
# <Feature Name>

One-line description of what it does.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/<module>/<file>.ts` | What it does |

## How It Works

### 1. Step Name
Description of the step.

### 2. Step Name
Description of the step.

## Key Types

\```typescript
interface ExampleType {
  field: string
}
\```

## Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `<command_name>` | What it does |
```

### 3. Add a Cross-Reference

In `docs/overview/README.md`, add a row to the Feature Modules table:

```markdown
| [<feature>](./<feature>/README.md) | Short description |
```

### 4. Rebuild

```powershell
npm run docs:combine
```

---

## What NOT to Document

- Internal/private functions (not exported)
- Implementation details that change frequently
- Auto-generated code
- Third-party library internals

Focus on: **what** the feature does, **how** to use it, and the **public API** (types, tools, commands).

---

## Verification

After updating docs, check:

1. All file paths in "Key Files" tables actually exist
2. All type names in "Key Types" sections match the source
3. All Tauri commands listed are real `#[tauri::command]` functions
4. No broken internal links (if any cross-references exist)
5. `npm run docs:combine` runs without errors
