# Phase 2: Per-Project Queueing — Implementation Plan

## Overview

Phase 2 introduces the project layer: tasks belong to projects, each project owns a prioritised queue and an unordered backlog, and a new Projects Overview shows all projects side-by-side. The phase begins with a required refactor of queue storage — moving order data out of `data.json` and into per-project Markdown files — before any new UI is built.

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Queue storage format | Per-project `queue.md` with wikilinks body | Obsidian-native; one file per queue avoids the single-`data.json` bottleneck |
| Backlog storage format | Per-project `backlog.md` with wikilinks body | Same format as queue; unordered, unprioritised |
| Queue source of truth | Body wikilinks (one link per line, top = front of queue) | Human-readable and Obsidian graph-visible; parsed via `metadataCache` link resolution |
| Task file location | `mind-graph/Projects/<slug>/Tasks/<name>.md` | Co-locates tasks with their project; aligns with Data Storage spec |
| Project metadata | `mind-graph/Projects/<slug>/project.md` (frontmatter) | Uniform single-file-per-entity pattern |
| Default project | Auto-created slug `default`; cannot be deleted | Every task must belong to a project; avoids null-checks throughout |
| Project ID / slug | Lowercase, hyphen-separated sanitisation of name | Stable folder name even if project is renamed (name lives in `project.md` frontmatter) |
| `Task.project` field | Now always a non-null slug string (default `"default"`) | Eliminates the `string \| null` branch everywhere |
| Phase 1 TaskQueueView removed | Deleted; replaced by Projects Overview and per-project tabs | No longer needed — the project views cover all queue interactions |
| TaskQueuePanel reuse in overview | `ProjectsOverviewPanel` renders one `<TaskQueuePanel>` per project, stacked row by row | Avoids duplication; overview is literally a list of queue rows with clickable project headers |
| Individual project view | New workspace tab per project | Keeps the queue pattern consistent; `VIEW_TYPE_PROJECT` parameterised by slug |
| Projects Overview view | New workspace tab (singleton) | Single entry point to all project queues; replaces the old global queue ribbon |
| Backlog placement | Lower section of the individual project view | Keeps queue and backlog in one tab; avoids extra tab proliferation |
| Add Task destination | Radio in `TaskEditForm`: "Queue" vs "Backlog" | Explicit, no ambiguity about where a new task lands |

---

## 1. Refactor: Queue Storage Migration

This is the first thing built in Phase 2. Nothing else starts until the refactor is complete and smoke-tested.

### 1.1 New file layout after migration

```
mind-graph/
  Projects/
    default/
      project.md        ← project metadata
      queue.md          ← ordered task links
      backlog.md        ← unordered task links
      Tasks/
        fix-login-bug.md
        write-unit-tests.md
    my-project/
      project.md
      queue.md
      backlog.md
      Tasks/
        …
  Config/               ← reserved for future phases
  Agents/               ← reserved for Phase 4
```

The `mind-graph/Tasks/` flat folder from Phase 1 is **replaced** by per-project `Tasks/` subfolders.

### 1.2 `queue.md` and `backlog.md` format

```markdown
---
project: default
type: queue
---

- [[mind-graph/Projects/default/Tasks/fix-login-bug]]
- [[mind-graph/Projects/default/Tasks/write-unit-tests]]
```

- Each line in the body is one wikilink. Order of lines = queue order (top = highest priority).
- `backlog.md` is identical in format; order of lines carries no meaning.
- The plugin always rewrites the entire body on mutation — no in-place line edits.
- Links use vault-relative paths so `metadataCache` can resolve them without extra lookups.

### 1.3 `project.md` format

```markdown
---
id: "default"
name: "Default"
description: ""
createdAt: "2026-06-07T00:00:00.000Z"
---
```

- `id` = slug, matches folder name, never changes.
- `name` = display name, user-editable.

---

## 2. Data Model

### 2.1 Updated `Task` interface (`src/types.ts`)

```ts
export interface Task {
  id: string;
  filePath: string;              // now "mind-graph/Projects/<slug>/Tasks/<name>.md"
  title: string;
  description: string;
  completionCriteria: string;
  completed: boolean;
  automatable: boolean;
  contextType: string | null;
  dependencies: string[];
  project: string;               // slug — NEVER null from Phase 2 onward
}
```

### 2.2 New `Project` interface (`src/types.ts`)

```ts
export interface Project {
  id: string;                    // slug, matches folder name
  name: string;                  // display name
  description: string;
  createdAt: string;             // ISO 8601
}
```

### 2.3 Updated `MindGraphData` (`src/types.ts`)

```ts
export interface MindGraphData {
  // queue field removed — order now lives in queue.md files
}
```

The `QueueStore` and `queue` key are **removed** from `MindGraphData`. Queue order is authoritative in the Markdown files.

---

## 3. Storage API

### 3.1 `ProjectStore` (`src/utils/projectStore.ts`)

```ts
class ProjectStore {
  constructor(private app: App, private plugin: MindGraphPlugin) {}

  // Ensure mind-graph/Projects/ and the default project exist
  async ensureDefaults(): Promise<void>

  // Create a new project folder + project.md + queue.md + backlog.md
  async createProject(name: string, description?: string): Promise<Project>

  // Read project metadata from project.md frontmatter
  async readProject(slug: string): Promise<Project>

  // Update project.md (name, description only — id never changes)
  async updateProject(project: Project): Promise<void>

  // Delete a project folder and all tasks within it (with guard: refuse if tasks exist)
  async deleteProject(slug: string): Promise<void>

  // Return all projects (scan Projects/ subfolders for project.md files)
  async listAllProjects(): Promise<Project[]>

  // Derive a unique slug from a display name
  slugify(name: string): string
}
```

### 3.2 `QueueFileStore` (`src/utils/queueFileStore.ts`)

Replaces `QueueOrderStore`. Reads and writes `queue.md` and `backlog.md`.

```ts
class QueueFileStore {
  constructor(private app: App, private plugin: MindGraphPlugin) {}

  // Read queue.md → ordered array of task file paths
  async getQueueOrder(projectSlug: string): Promise<string[]>

  // Overwrite queue.md with a new order (array of vault-relative file paths)
  async setQueueOrder(projectSlug: string, filePaths: string[]): Promise<void>

  // Append a task path to the end of queue.md
  async appendToQueue(projectSlug: string, filePath: string): Promise<void>

  // Remove a task path from queue.md
  async removeFromQueue(projectSlug: string, filePath: string): Promise<void>

  // Move a task within queue.md (drag-drop)
  async moveInQueue(projectSlug: string, fromIndex: number, toIndex: number): Promise<void>

  // Read backlog.md → unordered array of task file paths
  async getBacklog(projectSlug: string): Promise<string[]>

  // Add a task path to backlog.md
  async addToBacklog(projectSlug: string, filePath: string): Promise<void>

  // Remove a task path from backlog.md
  async removeFromBacklog(projectSlug: string, filePath: string): Promise<void>

  // Move a task from backlog to the end of the queue
  async promoteToQueue(projectSlug: string, filePath: string): Promise<void>
}
```

**Parsing strategy:** Read the file, extract lines that match `/^\- \[\[(.+?)\]\]/`. The captured group is the vault-relative path. On write, regenerate the full file from the path array.

### 3.3 Updated `TaskStore` (`src/utils/taskStore.ts`)

Changes from Phase 1:

| Method | Change |
|---|---|
| `createTask(title, projectSlug, destination)` | `destination: 'queue' \| 'backlog'`; creates file under `Projects/<slug>/Tasks/`; calls `queueFileStore` or `backlogFileStore` |
| `readTask(filePath)` | No change — still reads any path |
| `updateTask(task)` | No change |
| `deleteTask(task)` | Must also call `removeFromQueue` or `removeFromBacklog` on the owning project |
| `listAllTasks(projectSlug?)` | Scans `Projects/<slug>/Tasks/` if slug given; all project folders otherwise |
| `getQueue(projectSlug)` | Reads `queue.md`, resolves each path → Task |
| `getBacklog(projectSlug)` | Reads `backlog.md`, resolves each path → Task |
| `moveTaskToProject(task, targetSlug)` | Moves file, updates frontmatter, updates both queue files |

---

## 4. Obsidian Plugin Wiring (`src/main.ts`)

```ts
import { ProjectsOverviewView, VIEW_TYPE_PROJECTS_OVERVIEW } from './ui/ProjectsOverviewView';
import { ProjectQueueView, VIEW_TYPE_PROJECT_QUEUE } from './ui/ProjectQueueView';

async onload() {
  await this.loadSettings();

  this.registerView(VIEW_TYPE_PROJECTS_OVERVIEW, (leaf) => new ProjectsOverviewView(leaf, this));
  this.registerView(VIEW_TYPE_PROJECT_QUEUE,    (leaf) => new ProjectQueueView(leaf, this));

  this.addCommand({ id: 'open-projects-overview', name: 'Open Projects Overview', callback: () => this.activateProjectsOverview() });

  this.addRibbonIcon('layout-grid', 'Projects Overview', () => this.activateProjectsOverview());

  this.addSettingTab(new MindGraphSettingTab(this.app, this));
}

private async activateProjectsOverview() {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_PROJECTS_OVERVIEW)[0];
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_PROJECTS_OVERVIEW, active: true });
  }
  workspace.revealLeaf(leaf);
}

// Opens (or focuses) the tab for a specific project queue
async activateProjectQueue(slug: string) {
  const { workspace } = this.app;
  const existing = workspace.getLeavesOfType(VIEW_TYPE_PROJECT_QUEUE)
    .find(l => (l.view as ProjectQueueView).projectSlug === slug);
  const leaf = existing ?? workspace.getLeaf('tab');
  await leaf.setViewState({ type: VIEW_TYPE_PROJECT_QUEUE, active: true, state: { slug } });
  workspace.revealLeaf(leaf);
}
```

---

## 5. UI Components

### 5.1 `ProjectsOverviewView` (`src/ui/ProjectsOverviewView.tsx`)

Extends `ItemView`. Singleton tab.

```ts
export const VIEW_TYPE_PROJECTS_OVERVIEW = 'mind-graph-projects-overview';

export class ProjectsOverviewView extends ItemView {
  getViewType()    { return VIEW_TYPE_PROJECTS_OVERVIEW; }
  getDisplayText() { return 'Projects'; }
  getIcon()        { return 'layout-grid'; }

  async onOpen() {
    this.root = createRoot(this.containerEl.children[1] as HTMLElement);
    this.root.render(<ProjectsOverviewPanel plugin={this.plugin} />);
  }

  async onClose() { this.root?.unmount(); }
}
```

### 5.2 `ProjectsOverviewPanel` (`src/ui/ProjectsOverviewPanel.tsx`)

**State:** `projects: Project[]`, `loading: boolean`

**Responsibilities:**
- Fetch all projects on mount
- Render a "New Project" button
- Render a vertical stack of `<TaskQueuePanel projectSlug={slug} onProjectNameClick={...} />`, one per project
- Pass `onProjectNameClick={() => plugin.activateProjectQueue(slug)}` into each panel so the project name header navigates to the individual tab

Each row is a fully functional queue — users can add tasks, reorder, and mark done directly from the overview.

### 5.3 Updated `TaskQueuePanel` (`src/ui/TaskQueuePanel.tsx`)

**Props change:** `{ plugin: MindGraphPlugin }` → `{ plugin: MindGraphPlugin, projectSlug: string, onProjectNameClick?: () => void }`

**Behaviour change:**
- Fetches queue for `projectSlug` instead of the old global queue from `data.json`
- Renders the project name as a header above the card row; when `onProjectNameClick` is provided the name is a clickable link, otherwise plain text
- All existing DnD, add, done, delete logic unchanged — just routed through `queueFileStore` instead of the old `queueStore`

### 5.4 `ProjectQueueView` (`src/ui/ProjectQueueView.tsx`)

Extends `ItemView`. One tab per project.

```ts
export const VIEW_TYPE_PROJECT_QUEUE = 'mind-graph-project-queue';

export class ProjectQueueView extends ItemView {
  projectSlug: string = '';

  getViewType()    { return VIEW_TYPE_PROJECT_QUEUE; }
  getDisplayText() { return this.projectSlug ? `Queue: ${this.projectSlug}` : 'Project Queue'; }
  getIcon()        { return 'list-checks'; }

  async setState(state: { slug: string }, result: ViewStateResult) {
    this.projectSlug = state.slug;
    this.root?.render(<ProjectQueuePanel plugin={this.plugin} projectSlug={state.slug} />);
  }

  async onOpen() {
    this.root = createRoot(this.containerEl.children[1] as HTMLElement);
  }

  async onClose() { this.root?.unmount(); }
}
```

### 5.5 `ProjectQueuePanel` (`src/ui/ProjectQueuePanel.tsx`)

New component. The individual project tab's root content. Composes existing components rather than duplicating logic.

**Props:** `{ plugin: MindGraphPlugin, projectSlug: string }`

**State:** `project: Project | null`, `backlogTasks: Task[]`, `loading: boolean`

**Renders:**
1. Project header: name (plain text, not a link), edit-project button, delete-project button
2. `<TaskQueuePanel projectSlug={projectSlug} />` — the full queue, without `onProjectNameClick` so the header is non-clickable
3. `<BacklogSection>` — below the queue, fetches and displays backlog tasks

### 5.6 `BacklogSection` (`src/ui/BacklogSection.tsx`)

**Props:**
```ts
interface BacklogSectionProps {
  tasks: Task[];
  onPromote: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}
```

Renders a vertical list of backlog task rows. Each row has a "→ Queue" button (promote), edit icon, and delete icon. No drag-and-drop within the backlog (order is meaningless).

### 5.7 `ProjectEditModal` / `ProjectEditForm` (`src/ui/ProjectEditModal.tsx`, `ProjectEditForm.tsx`)

Follows the same Modal + pure-React-form split as `TaskEditModal` / `TaskEditForm`.

**`ProjectEditFormProps`:**
```ts
interface ProjectEditFormProps {
  project: Project | null;    // null = create new
  onSave: (project: Project) => Promise<void>;
  onCancel: () => void;
}
```

**Fields:** Name (text input), Description (textarea).

### 5.8 Updated `TaskEditForm` (`src/ui/TaskEditForm.tsx`)

New fields added:

| Field | Type | Notes |
|---|---|---|
| Project | `<select>` dropdown | Lists all project names; pre-selected when opened from a project view |
| Destination | Radio: Queue / Backlog | Defaults to Queue |

The `onSave` callback receives an updated `Task` (with `project` slug) plus a `destination: 'queue' \| 'backlog'` value.

---

## 6. UI Mockups

### 6.1 Projects Overview Tab

Each project is a full `<TaskQueuePanel>` row. The project name is a clickable link that opens the individual project tab. Rows stack vertically; each queue scrolls horizontally independently.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Projects                                                      [+ New Project]       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  [Default ↗]                                                       [+ Add Task]     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                  │
│  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │                  │
│  │  Fix login bug   │  │  Write unit      │  │  Update README   │                  │
│  │  on mobile       │  │  tests for auth  │  │  with setup      │                  │
│  │          [✓] [✕] │  │          [✓] [✕] │  │          [✓] [✕] │                  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘                  │
│  ◄──────────────────────────────────────────────────── scroll ──────────────────►  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  [ObsidianMindGraph ↗]                                             [+ Add Task]     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────  │
│  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │     ≡ ≡ ≡     │
│  │  Refactor queue  │  │  Add project UI  │  │  Write docs      │  │  Deploy …     │
│  │  storage         │  │                  │  │                  │  │               │
│  │          [✓] [✕] │  │          [✓] [✕] │  │          [✓] [✕] │  │       [✓] [✕] │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └─────────────  │
│  ◄──────────────────────────────────────────────────── scroll ──────────────────►  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

[Name ↗] = clickable project name — opens individual project tab
```

### 6.2 Individual Project Tab

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Queue: ObsidianMindGraph                                    [+ Add Task]  [✎] [✕]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  QUEUE                                                                              │
│                                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────  │
│  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │     ≡ ≡ ≡     │
│  │                  │  │                  │  │                  │  │               │
│  │  Refactor queue  │  │  Add project UI  │  │  Migration       │  │  Write docs   │
│  │  storage         │  │                  │  │  utility         │  │  …            │
│  │                  │  │                  │  │                  │  │               │
│  │          [✓] [✕] │  │          [✓] [✕] │  │          [✓] [✕] │  │       [✓] [✕] │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └─────────────  │
│                                                                                     │
│  ◄──────────────────────────────────────────────────────── scroll ─────────────►   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  BACKLOG                                                                            │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Survey animation libraries for DnD                        [→ Queue] [✎] [✕] │   │
│  ├──────────────────────────────────────────────────────────────────────────────┤   │
│  │  Investigate Obsidian mobile API gaps                      [→ Queue] [✎] [✕] │   │
│  ├──────────────────────────────────────────────────────────────────────────────┤   │
│  │  Write keyboard shortcut docs                              [→ Queue] [✎] [✕] │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

≡ ≡ ≡   = drag handle (horizontal reorder within queue)
✓       = mark done
✕       = delete
→ Queue = promote backlog task to end of queue
double-click card body = open Task Edit Modal
```

### 6.3 Updated Task Edit Modal

```
┌─────────────────────────────────────────────────────┐
│  New Task                                       [✕]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Project                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │ ObsidianMindGraph                        ▾  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Title                                              │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Description                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Completion Criteria                                │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Add to   (●) Queue   (○) Backlog                   │
│                                                     │
│  [ ] Can be automated  (coming in a future phase)   │
│                                                     │
│                            [Cancel]  [Save Task]    │
└─────────────────────────────────────────────────────┘
```

### 6.4 Project Edit Modal

```
┌─────────────────────────────────────────────────────┐
│  New Project                                    [✕]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name                                               │
│  ┌─────────────────────────────────────────────┐   │
│  │ ObsidianMindGraph                           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Description                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│                            [Cancel]  [Save Project] │
└─────────────────────────────────────────────────────┘
```

---

## 7. File & Folder Structure

```
src/
  main.ts                         # activateProjectsOverview, activateProjectQueue; old task queue view/command/ribbon removed
  settings.ts                     # no new fields in Phase 2
  types.ts                        # + Project; Task.project now string (not null)
  ui/
    TaskQueueView.tsx              # DELETED — replaced by ProjectsOverviewView + ProjectQueueView
    TaskQueuePanel.tsx             # Updated: add projectSlug prop + optional onProjectNameClick callback
    TaskCard.tsx                   # Phase 1 — unchanged
    TaskEditModal.tsx              # Updated: passes projects list, destination
    TaskEditForm.tsx               # Updated: project dropdown + queue/backlog radio
    ProjectsOverviewView.tsx       # NEW — ItemView wrapper
    ProjectsOverviewPanel.tsx      # NEW — fetches all projects, renders one <TaskQueuePanel> per project row
    ProjectQueueView.tsx           # NEW — ItemView wrapper (per-project)
    ProjectQueuePanel.tsx          # NEW — project header + <TaskQueuePanel> + <BacklogSection>
    BacklogSection.tsx             # NEW — vertical backlog list
    ProjectEditModal.tsx           # NEW — Modal wrapper
    ProjectEditForm.tsx            # NEW — pure React form
  utils/
    constants.ts                   # + PROJECTS_FOLDER, DEFAULT_PROJECT_SLUG
    taskStore.ts                   # Updated: project-scoped paths, destination param
    queueFileStore.ts              # NEW — replaces queueStore.ts
    projectStore.ts                # NEW — Project CRUD
    taskSerializer.ts              # Updated: project field always a string
    undoNotice.ts                  # Phase 1 — unchanged
    ids.ts                         # Phase 1 — unchanged
```

Updated constants:

```ts
// src/utils/constants.ts
export const MIND_GRAPH_ROOT       = 'mind-graph';
export const PROJECTS_FOLDER       = `${MIND_GRAPH_ROOT}/Projects`;
export const DEFAULT_PROJECT_SLUG  = 'default';
export const DEFAULT_PROJECT_NAME  = 'Default';

// Derived helpers
export const projectFolder  = (slug: string) => `${PROJECTS_FOLDER}/${slug}`;
export const tasksFolder    = (slug: string) => `${projectFolder(slug)}/Tasks`;
export const queueFilePath  = (slug: string) => `${projectFolder(slug)}/queue.md`;
export const backlogFilePath = (slug: string) => `${projectFolder(slug)}/backlog.md`;
export const projectFilePath = (slug: string) => `${projectFolder(slug)}/project.md`;
```

---

## 8. Implementation Steps (Ordered)

### Step 1 — Update types and constants
1. Update `Task.project` to `string` (remove `| null`).
2. Add `Project` interface.
3. Update `MindGraphData` (remove `queue` key, bump `schemaVersion` to `2`).

### Step 2 — Project storage
1. Implement `src/utils/projectStore.ts`.
2. Implement `src/utils/queueFileStore.ts` (queue and backlog read/write).
3. Update `src/utils/taskStore.ts`:
   - Paths use `tasksFolder(project)`.
   - `createTask` accepts `projectSlug` and `destination`.
   - `deleteTask` removes from queue/backlog file.
4. Remove `src/utils/queueStore.ts` (old Phase 1 file).

### Step 3 — Project Edit Modal (pure React)
1. Implement `src/ui/ProjectEditForm.tsx`.
2. Implement `src/ui/ProjectEditModal.tsx`.

### Step 4 — Update `TaskQueuePanel`
1. Add `projectSlug: string` prop; wire queue fetching through `queueFileStore` instead of the old `queueStore`.
2. Add optional `onProjectNameClick?: () => void` prop; render project name as a clickable link when provided, plain text otherwise.
3. Remove any reference to the old global `data.json` queue.

### Step 5 — Projects Overview
1. Implement `src/ui/ProjectsOverviewPanel.tsx` (fetches projects, renders `<TaskQueuePanel>` rows with `onProjectNameClick`).
2. Implement `src/ui/ProjectsOverviewView.tsx`.

### Step 6 — Individual Project View
1. Implement `src/ui/BacklogSection.tsx`.
2. Implement `src/ui/ProjectQueuePanel.tsx` (project header + `<TaskQueuePanel>` without click handler + `<BacklogSection>`).
3. Implement `src/ui/ProjectQueueView.tsx`.

### Step 6 — Update Task Edit Form
1. Add project dropdown to `TaskEditForm`.
2. Add queue/backlog radio to `TaskEditForm`.
3. Update `TaskEditModal` to receive and pass down the projects list.

### Step 7 — Plugin wiring
1. Remove `VIEW_TYPE_TASK_QUEUE` registration, `open-task-queue` command, and `list-checks` ribbon icon from `main.ts`.
2. Remove `activateView()` method.
3. Register `VIEW_TYPE_PROJECTS_OVERVIEW` and `VIEW_TYPE_PROJECT_QUEUE`.
4. Add `activateProjectsOverview` and `activateProjectQueue(slug)` methods.
5. Add `layout-grid` ribbon icon and `open-projects-overview` command.

### Step 8 — Manual smoke test
1. `npm run dev`
2. Reload plugin. Verify Default project folder and files are created on first load.
3. Open Projects Overview → Default project appears.
4. Create a new project → project folder and files appear in vault.
5. Add task to new project queue → task `.md` file appears under correct project.
6. Add task to backlog → appears in Backlog section; promote it → moves to queue.
7. Reorder queue via drag-and-drop → `queue.md` body reflects new order after drop.
8. Mark task done → removed from `queue.md`; undo toast works.
9. Delete task → removed from vault and from `queue.md`/`backlog.md`.
10. Delete project (non-default, empty) → folder removed.

---

## 9. Obsidian API Reference Additions

| Need | API |
|---|---|
| Move/rename a vault file | `app.vault.rename(file, newPath)` |
| Check if a path exists | `app.vault.adapter.exists(path)` |
| Create a folder | `app.vault.createFolder(path)` |
| List children of a folder | Cast `app.vault.getAbstractFileByPath(path)` to `TFolder`, use `.children` |
| Resolve a wikilink to a file | `app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)` |
| Read links in a file | `app.metadataCache.getFileCache(file)?.links` |
| Pass state to a view | `leaf.setViewState({ type, active: true, state: { slug } })` |
| Read state in a view | Override `setState(state, result)` in `ItemView` subclass |

---

## 10. Out of Scope for Phase 2

- Dependency management and graph rendering (Phase 3)
- Agentic contexts and task execution (Phase 4)
- Semantic note organisation (Pillar 1)
- Moving tasks between projects via drag-and-drop (Phase 3+)
- Per-project settings or AI model overrides (Phase 4)
- The `automatable` and `contextType` fields remain stored in frontmatter but disabled in UI
