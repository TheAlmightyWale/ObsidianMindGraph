# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ObsidianMindGraph is an Obsidian plugin built around two distinct but integrated pillars:

1. **Semantic Note Organization** — AI-driven analysis of vault notes: tagging, relating notes to each other, generating summary hierarchy nodes, and queuing all proposed changes for user review before they are applied.
2. **Task Management for Humans and AI Agents** — a unified task queue across multiple projects, where tasks carry enough context for AI agents to autonomously gather further context and execute work, while also being human-readable and actionable.

The two pillars share the concept of a **context** — a typed descriptor (coding, research, summarization, etc.) that determines which AI model and prompt set is used for a given note sweep or task execution.

The `PluginTestVault/` directory is an Obsidian vault used for manual testing during development. The sample plugin scaffold lives at `PluginTestVault/.obsidian/plugins/mind-graph/`.

## Commands

```bash
npm install       # install dependencies
npm run dev       # watch mode — rebuilds into PluginTestVault/.obsidian/plugins/<id>/
npm run build     # production bundle
npm run lint      # ESLint with obsidian-specific rules
```

For hot-reload during development, enable the "Hot Reload" community plugin in the test vault. Build artifacts (`main.js`, `manifest.json`, `styles.css`) must be at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.

## File & Folder Structure

Source lives in `<Vault>/.obsidian/plugins/<plugin-id>/src/`. Keep `main.ts` minimal — only plugin lifecycle (`onload`, `onunload`, `addCommand` calls). Delegate all feature logic to separate modules. Split any file that exceeds ~200–300 lines.

```
src/
  main.ts           # Plugin lifecycle only
  settings.ts       # Settings interface and defaults
  types.ts          # TypeScript interfaces and types
  commands/         # Command implementations
  ui/               # ItemViews, modals, sidebar panes
  utils/            # Helpers, constants
```

Do not commit `node_modules/`, `main.js`, or other build artifacts.

## Coding Conventions

- TypeScript with `"strict": true`.
- `async/await` over promise chains.
- Register and clean up all listeners, intervals, and DOM events using `this.registerEvent()`, `this.registerDomEvent()`, `this.registerInterval()` — never attach and forget.
- Keep startup light; defer heavy work until needed. Debounce/throttle file system event handlers.
- Avoid Node/Electron APIs if mobile compatibility is desired; set `isDesktopOnly` accordingly.
- Bundle everything into `main.js` — no unbundled runtime dependencies.

## Security & Privacy (especially relevant given AI calls)

- Default to local/offline operation. Network requests (AI API calls) require explicit user opt-in and clear disclosure in settings.
- Never store or transmit vault contents beyond what is required for the active operation, and only with user consent.
- No telemetry without explicit opt-in.
- Never execute remote code or auto-update plugin code outside of normal releases.
- Read/write only inside the vault.

## Agent Do / Don't

**Do**
- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.

**Don't**
- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Planned Architecture

### Pillar 1: Semantic Note Organization

**Sweep loop** — triggered manually or on a cadence. For each new/updated note:
- Semantic analysis: understand the note's content and type (terminology, concept, code snippet, chapter, etc.)
- Relate to existing notes via backlinks and shared tags
- Propose tags, links, and placement in the hierarchy
- All proposals go into the **change queue** — never applied silently

**Change queue** — a reviewable list of text diffs and proposed actions. Users approve or reject each change. Approved changes are written to the vault. An "Add to examples" button on any approved action saves it as a positive example in the prompt context (lightweight in-context reinforcement).

**Hierarchy / summary nodes** — once notes exceed a length or density threshold, generate a summary node that links back to relevant source sections. Central concept pages (tag root nodes) emerge organically once enough notes share a tag — they are not pre-defined.

### Pillar 2: Task Management

Tasks exist in the context of **projects**. The plugin supports multiple projects simultaneously and provides a **unified cross-project task queue** as the default view — a single place to see all upcoming tasks across all projects, prioritized or sorted as configured.

From the unified queue, users can drill into any project's individual task queue for full detail.

**Per-task data model:**
- Description and completion criteria
- Project association
- Dependencies (other tasks)
- Automation flag — whether an AI agent can execute it autonomously
- Context type — determines which model and prompt set the agent uses

**Per-context data model:**
- Type: coding, research, summarization, etc.
- Associated prompt template(s)
- Associated AI model(s)

**AI agent task execution:** When a task is marked automatable and triggered, an agent uses the task's context type to select the right model/prompt, then uses the vault graph (backlinks, tags, metadata) as the primary source for gathering further context before executing. The agent's proposed output feeds back into the change queue for review.

### Shared Concepts

- **Context** is the bridge between both pillars — it governs model/prompt selection for both note sweeps and task execution.
- The **change queue** is the single review surface for both organizational changes and AI-executed task outputs.
- Tasks can reference notes, and notes can reference tasks — the vault graph and the task graph are intentionally linked.
- Context types are user-configurable, not hardcoded — the plugin ships with defaults but users extend them.

### Obsidian API Surface

- `app.vault` — read, modify, create notes
- `app.metadataCache` — frontmatter, backlinks, resolved links for graph traversal
- `app.workspace` — layout and sidebar management
- `registerView()` / `ItemView` — unified task queue pane, per-project drill-down pane, change queue pane
- `addCommand()` — trigger sweep, approve/reject queued changes, create task
- `addSettingTab()` — configure AI model keys, context types, sweep cadence, project list

## References

- Sample plugin & AGENTS.md: `PluginTestVault/.obsidian/plugins/mind-graph/`
- Obsidian API docs: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
