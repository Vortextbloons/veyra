---
name: Veyra auditor
description: This skill is for a full in depth audit using many subagents of the codebase only use this if the user asks for an audit
---

# Your Skill Name

Veyra Full Audit Skill
Purpose

You are performing a deep, read-only audit of Veyra.

Veyra is a local-first AI desktop workspace built with:

Tauri v2
Rust backend command modules
SQLite via rusqlite
React 19
TypeScript
Vite
Tailwind CSS
Zustand
LM Studio provider integration
OpenAI-compatible provider adapter
OpenCode CLI agents mode
optional SearXNG Docker web search
modules for chat, documents, memory, projects, research, web search, email, characters, and agents

The goal is to find real issues and improvements across the whole system without changing code.

This skill must be used for full-codebase audits, pre-release reviews, architecture reviews, refactor planning, dead-code scans, performance reviews, security/privacy reviews, and future-proofing reviews.

Absolute Rules

Do not edit files.

Do not create patches.

Do not delete files.

Do not run destructive commands.

Do not reformat code.

Do not implement fixes.

Do not make assumptions that a feature is dead only because it is not obvious from one file.

Do not recommend removing code unless you have evidence.

Do not ignore feature-change risk. Veyra is still evolving, so every finding should consider whether the code is intentionally flexible for future features.

Read-Only Tool Behavior

You may inspect files, search the repo, read configs, inspect dependencies, inspect tests, inspect package metadata, inspect Rust manifests, inspect frontend routing, inspect stores, inspect Tauri commands, and inspect documentation.

Use subagents in parallel where possible.

Prefer targeted evidence over broad opinions.

Each finding should include:

Severity
Category
Files or modules involved
Evidence
Why it matters
Suggested fix direction
Confidence level
Whether the issue is urgent or can wait
Whether the finding could be affected by future planned features
Audit Philosophy

Be thorough but fair.

Veyra is not a tiny app. It has many feature modules that may be partially built or intentionally staged. Do not blindly mark unfinished-looking systems as bad. Instead classify them as:

Confirmed issue
Likely issue
Needs owner decision
Intentional but risky
Future-scope concern
Cleanup candidate
Do not change yet
Required Subagent Strategy

The primary audit agent should coordinate specialized subagents.

Run these perspectives:

Architecture Auditor
Dead Code Auditor
Frontend Auditor
Rust/Tauri Backend Auditor
Database/Persistence Auditor
AI/Provider/Agents Auditor
Security/Privacy Auditor
Performance Auditor
UX/Design Consistency Auditor
Testing/QA Auditor

If subagents are unavailable, simulate the same sections manually.

Each subagent should produce its own focused report.

The primary agent must then merge all reports into one final audit with deduplicated findings.

Required Audit Areas
1. Architecture and Boundaries

Check:

Module boundaries
Frontend/backend separation
Tauri command organization
Provider adapter design
Store boundaries
Repeated logic across modules
Circular dependencies
Overly large files
Feature coupling
Missing abstractions
Wrong abstraction timing
Code that will break when features change
Places where local-first assumptions are violated
2. Dead Code and Unused Code

Check:

Unused components
Unused hooks
Unused stores
Unused Rust commands
Unused Tauri IPC handlers
Unused types
Unused imports
Duplicate utilities
Old provider code
Old feature flags
Dead CSS classes
Unreachable UI states
Unused database tables or fields
Obsolete migrations or seed data

Do not mark something dead unless there is evidence.

Classify dead code confidence as:

High confidence dead
Medium confidence dead
Possibly future feature
Unknown
3. Frontend Quality

Check:

React component structure
State management with Zustand
Hook correctness
Re-render risks
Prop drilling
Duplicated UI state
Error boundaries
Loading states
Empty states
Accessibility
Keyboard navigation
Markdown rendering safety
Styling consistency
Tailwind misuse
Component naming
Overly complex components
Chat UI performance
Document editor flow
Project UI flow
Email UI flow
Characters/roleplay UI flow
Research/web-search UI flow
Agents UI flow
4. Rust/Tauri Backend

Check:

Tauri command organization
Error handling
Result types
Panics/unwraps/expects
Blocking work on async paths
Tokio usage
reqwest usage
process management
file I/O safety
path traversal risks
shell command risks
state management with parking_lot
base64/urlencoding usage
LM Studio setup commands
SearXNG setup commands
OpenCode CLI command handling
email command safety
document command safety
research command safety
memory command safety
5. Database and Persistence

Check:

SQLite schema design
rusqlite query safety
migrations
indexes
FTS/search tables if present
memory storage design
conversation storage
document storage
project storage
email storage
character/lorebook storage
timestamps
cascade behavior
orphan records
data corruption risks
backup/export needs
local-first privacy guarantees
future schema evolution
6. AI Provider and Agent Layer

Check:

LM Studio adapter
OpenAI-compatible adapter
provider abstraction
streaming behavior
cancellation behavior
retries/timeouts
token/context handling
model settings
temperature/max token handling
tool toggles
web search integration
research integration
memory injection
project memory behavior
OpenCode CLI integration
agent mode boundaries
prompt injection risks
unsafe tool exposure
accidental cloud dependency
unclear provider fallback behavior
7. Security and Privacy

Check:

Local-first claims
Secrets/tokens
API key storage
OAuth/token storage if email exists
email privacy
memory privacy
web search leakage
SearXNG Docker privacy assumptions
shell/process execution
path traversal
untrusted markdown/HTML
attachment handling
command injection
unsafe file reads/writes
logs containing sensitive data
exported data safety
cross-project memory leakage
accidental sending of local data to remote providers
8. Performance

Check:

Chat rendering large histories
Markdown rendering cost
syntax highlighting cost
Zustand subscription patterns
unnecessary re-renders
large SQLite queries
missing indexes
slow startup
blocking Tauri commands
repeated provider health checks
polling loops
web search latency
memory retrieval latency
embeddings/vector search if present
file/document loading
email sync/indexing if present
Docker/SearXNG overhead
LM Studio connection checks
9. UX and Product Consistency

Check:

Feature discoverability
Chat controls
projects
memory
documents
email
web search
research
agents
characters
settings
consistency across empty/loading/error states
confusing toggles
advanced settings hidden appropriately
privacy messaging
local-first trust indicators
destructive action confirmations
setup flow for LM Studio
setup flow for SearXNG
setup flow for OpenCode
setup flow for email accounts
10. Testing and QA

Check:

Unit test coverage
Integration test coverage
Rust tests
frontend tests
Tauri command tests
provider mock tests
database migration tests
security tests
error-state tests
offline tests
large-data tests
regression-prone areas
missing CI checks
lint/typecheck coverage
build verification
Future-Change Risk Review

Because Veyra features will change, every major finding must consider:

Will this code survive adding new providers?
Will this code survive adding project-specific memory?
Will this code survive universal email client support?
Will this code survive document editing/export formats?
Will this code survive more agent tools?
Will this code survive multi-model provider switching?
Will this code survive hosted/cloud optional mode later?
Will this code survive more modules without becoming impossible to maintain?

Flag code as future-risky when it is:

Hardcoded to one provider
Hardcoded to one project/global state
Hardcoded to one storage assumption
Hardcoded to one UI flow
Hardcoded to one model behavior
Duplicated across modules
Missing permission boundaries
Missing migration paths
Missing test seams
Output Requirements

The final audit must include:

Veyra Full Audit Report
1. Executive Summary

Summarize the overall health of the app.

Include:

Biggest strengths
Biggest risks
Top 5 urgent fixes
Top 5 cleanup opportunities
Top 5 future-proofing opportunities
2. Audit Scope

List what was inspected.

3. Method

Explain the subagent-style audit process.

4. Severity Scale

Use:

Critical: security/data loss/build-breaking
High: likely production issue or major maintainability risk
Medium: should fix soon
Low: cleanup or polish
Info: observation/future consideration
5. Findings by Severity

For each finding:

ID
Title
Severity
Category
Files/modules
Evidence
Impact
Recommended fix direction
Confidence
Future-change note
6. Findings by Module

Group findings by:

Frontend
Rust/Tauri backend
Database
AI/providers
Agents/OpenCode
Web search/SearXNG
Memory
Documents
Projects
Email
Characters
Research
Settings/connectivity
Build/config/tooling
7. Dead Code Candidates

Separate into:

High-confidence removal candidates
Needs owner decision
Possibly future feature
Do not remove yet
8. Refactor Opportunities

Group into:

Safe small refactors
Medium refactors
Large architecture refactors
Refactors to avoid for now
9. Performance Opportunities

List performance findings with estimated impact.

10. Security and Privacy Review

List privacy risks and required mitigations.

11. Testing Gaps

List missing tests by module and priority.

12. Future-Proofing Review

Explain where the architecture may struggle as Veyra grows.

13. Recommended Roadmap

Break fixes into:

Immediate
Next sprint
Later
Do not do yet
14. Questions for the Project Owner

Ask questions where the codebase cannot answer intent.

15. Final Recommendation

Give a clear next action.

Finding Format

Use this format for findings:

AUDIT-[number]: [Title]

Severity: Critical / High / Medium / Low / Info
Category: Architecture / Dead Code / Frontend / Backend / Database / AI / Security / Performance / UX / Testing
Files/modules: [list]
Confidence: High / Medium / Low
Future-change risk: Yes / No / Maybe

Evidence:

Explain what was found.

Impact:

Explain why it matters.

Recommended fix direction:

Explain what should change, but do not write code.

Owner decision needed:

Yes / No
If yes, explain the decision.
Do Not Do

Do not make code changes.

Do not produce diffs.

Do not remove files.

Do not run destructive commands.

Do not assume all incomplete features are bugs.

Do not produce a vague audit.

Do not hide uncertainty.

Do not over-prioritize style issues over security, data loss, broken flows, or maintainability risks.