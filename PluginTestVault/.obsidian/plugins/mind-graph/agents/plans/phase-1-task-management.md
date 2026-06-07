# Phase 1: Core Task Management — Implementation Plan

## Overview

Phase 1 establishes the foundational task management system: a workspace-tab queue panel, a modal-based task editor, and full CRUD over tasks stored as Markdown files in the user's vault. Drag-and-drop reordering is supported via `@dnd-kit/sortable`. No project or context concepts exist yet — those arrive in Phase 2 and 4 respectively.

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Task storage | Markdown files under `.mind-graph/Tasks/` | Native Obsidian format; reserved namespace keeps plugin files out of user notes |
| Queue ordering | Plugin data (`data.json`) | Decoupled from file content; avoids re-writing every .md on reorder |
| Queue panel location | Workspace tab | Full screen real estate; opened via command/ribbon |
| Task editor | Modal dialog | Simplest for Phase 1; avoids tab sprawl |
| Drag-and-drop | `@dnd-kit/sortable` | React 18 compatible, TypeScript-first, actively maintained; `react-beautiful-dnd` is incompatible |
| Rendering | React 18 + esbuild JSX | Consistent with future phases; clean component model |
| Undo mechanism | Obsidian `Notice` with injected button | No extra dependency; idiomatic Obsidian pattern |

---

## 1. Build & React Boilerplate

### 1.1 New dependencies

```bash
# Runtime
npm install react react-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Types (dnd-kit is TypeScript-first — no separate @types packages needed)
npm install -D @types/react @types/react-dom
```

### 1.2 `tsconfig.json` changes

Add `jsx` support and include `.tsx` files:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "jsx": "react",
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

### 1.3 `esbuild.config.mjs` changes

Add the `jsx` option to the esbuild context:

```js
const context = await esbuild.context({
  // ... existing options ...
  jsx: 'automatic',   // enables the React 18 JSX transform (no import needed)
});
```

### 1.4 React root pattern (used in both View and Modal)

```tsx
// In onOpen() / Modal.onOpen():
import { createRoot, Root } from 'react-dom/client';

private root: Root | null = null;

onOpen() {
  this.root = createRoot(this.containerEl.children[1] as HTMLElement);
  this.root.render(<TaskQueuePanel plugin={this.plugin} />);
}

onClose() {
  this.root?.unmount();
  this.root = null;
}
```

> **Why `children[1]`?** Obsidian's `ItemView` creates two children inside `containerEl`: `[0]` is the header bar, `[1]` is the content area. Always render into index 1.

---

## 2. Data Model

### 2.1 TypeScript interfaces (`src/types.ts`)

```ts
export interface Task {
  id: string;                    // UUID, never changes
  filePath: string;              // vault-relative path, e.g. ".mind-graph/Tasks/my-task.md"
  title: string;                 // first H1 heading in the file body
  description: string;           // markdown body after the heading
  completionCriteria: string;    // frontmatter field
  completed: boolean;            // frontmatter field
  automatable: boolean;          // frontmatter field (Phase 1: always false)
  contextType: string | null;    // frontmatter field (Phase 1: always null)
  dependencies: string[];        // array of task IDs (Phase 1: always [])
  project: string | null;        // frontmatter field (Phase 1: always null)
}

export interface QueueStore {
  queueOrder: string[];          // ordered array of task IDs for the active queue
  doneTaskIds: string[];         // IDs of completed tasks (hidden from queue)
}

export interface MindGraphData {
  queue: QueueStore;
  // Future phases extend this
}
```

### 2.2 Markdown file format

Each task is a single `.md` file under `.mind-graph/Tasks/`. The `.mind-graph/` directory is the plugin's reserved namespace in the vault — all plugin-managed files live here, organised by subfolder. Users are not expected to edit these files directly.

| Path | Contents |
|---|---|
| `.mind-graph/Tasks/` | One `.md` file per task |
| `.mind-graph/` (future phases) | Projects, contexts, change queue, etc. |

```markdown
---
id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
completed: false
completionCriteria: "The feature renders without errors and passes manual smoke test."
automatable: false
contextType: null
dependencies: []
project: null
---

# Fix login bug

Investigate why the OAuth redirect fails on mobile. Check the callback URL
configuration and compare against the desktop flow.
```

- **`id`** — UUID generated at creation; never changes even if the file is renamed.
- **`title`** — the H1 heading; also used as the file name (sanitised).
- **`description`** — everything below the H1.
- Queue position is **not** stored in frontmatter — it lives in `data.json`.

---

## 3. Storage API (`src/utils/taskStore.ts`)

All vault operations go through this module. It uses Obsidian's `app.vault` and `app.metadataCache`.

```ts
class TaskStore {
  constructor(private app: App, private plugin: MindGraphPlugin) {}

  // Ensure .mind-graph/Tasks/ exists (called once on plugin load)
  async ensureFolder(): Promise<void>

  // Create a new task file and add it to the queue
  async createTask(title: string): Promise<Task>

  // Read a single task from its vault path
  async readTask(filePath: string): Promise<Task>

  // Write updated task back to vault (overwrites frontmatter + body)
  async updateTask(task: Task): Promise<void>

  // Delete a task file from vault
  async deleteTask(task: Task): Promise<void>

  // Return all tasks in the configured tasks folder
  async listAllTasks(): Promise<Task[]>

  // Return only the tasks in queue order (excludes done tasks)
  async getQueue(): Promise<Task[]>
}
```

### 3.1 Queue ordering (`src/utils/queueStore.ts`)

```ts
class QueueOrderStore {
  constructor(private plugin: MindGraphPlugin) {}

  // Read current order from data.json
  getOrder(): string[]                           // returns task IDs

  // Persist a new order
  async setOrder(ids: string[]): Promise<void>

  // Append a new task ID to the end
  async append(taskId: string): Promise<void>

  // Remove a task ID (called on delete or mark-done)
  async remove(taskId: string): Promise<void>

  // Move item from one index to another (drag-drop result)
  async move(fromIndex: number, toIndex: number): Promise<void>
}
```

### 3.2 Frontmatter parsing strategy

Obsidian provides two utilities importable from `'obsidian'`:

```ts
import { parseYaml, stringifyYaml } from 'obsidian';
```

Use `app.metadataCache.getFileCache(file)?.frontmatter` to read frontmatter cheaply (no file read). To write, read the file content, replace the YAML block between the `---` delimiters, then call `app.vault.modify(file, newContent)`.

Helper pattern:
```ts
function serializeTask(task: Task): string {
  const frontmatter = stringifyYaml({
    id: task.id,
    completed: task.completed,
    completionCriteria: task.completionCriteria,
    automatable: task.automatable,
    contextType: task.contextType,
    dependencies: task.dependencies,
    project: task.project,
  });
  return `---\n${frontmatter}---\n\n# ${task.title}\n\n${task.description}`;
}
```

---

## 4. Settings (`src/settings.ts`)

The tasks folder is a **plugin constant**, not a user setting. Because `.mind-graph/` is the plugin's reserved namespace, there is no reason to expose this path to users. Define it as a constant in a shared location:

```ts
// src/utils/constants.ts
export const MIND_GRAPH_ROOT = '.mind-graph';
export const TASKS_FOLDER    = `${MIND_GRAPH_ROOT}/Tasks`;
```

`MindGraphSettings` gains no new fields in Phase 1. The settings tab has no task-related options yet.

---

## 5. Obsidian Plugin Wiring (`src/main.ts`)

```ts
import { TaskQueueView, VIEW_TYPE_TASK_QUEUE } from './ui/TaskQueueView';

async onload() {
  await this.loadSettings();

  // Register the view type
  this.registerView(VIEW_TYPE_TASK_QUEUE, (leaf) => new TaskQueueView(leaf, this));

  // Command: open the task queue tab
  this.addCommand({
    id: 'open-task-queue',
    name: 'Open Task Queue',
    callback: () => this.activateView(),
  });

  // Ribbon icon shortcut
  this.addRibbonIcon('list-checks', 'Task Queue', () => this.activateView());

  this.addSettingTab(new MindGraphSettingTab(this.app, this));
}

private async activateView() {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASK_QUEUE)[0];
  if (!leaf) {
    leaf = workspace.getLeaf('tab');   // open as a new workspace tab
    await leaf.setViewState({ type: VIEW_TYPE_TASK_QUEUE, active: true });
  }
  workspace.revealLeaf(leaf);
}
```

> **Key Obsidian APIs used here:**
> - `registerView(type, viewCreator)` — must be called in `onload`; cleaned up automatically on plugin unload.
> - `workspace.getLeavesOfType(type)` — prevents opening duplicate tabs.
> - `workspace.getLeaf('tab')` — opens in a new editor tab (not sidebar).
> - `workspace.revealLeaf(leaf)` — focuses the tab.

---

## 6. UI Components

### 6.1 `TaskQueueView` (`src/ui/TaskQueueView.tsx`)

Extends Obsidian's `ItemView`. Mounts/unmounts the React tree.

```ts
export const VIEW_TYPE_TASK_QUEUE = 'mind-graph-task-queue';

export class TaskQueueView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MindGraphPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_TASK_QUEUE; }
  getDisplayText() { return 'Task Queue'; }
  getIcon() { return 'list-checks'; }

  async onOpen() {
    this.root = createRoot(this.containerEl.children[1] as HTMLElement);
    this.root.render(<TaskQueuePanel plugin={this.plugin} />);
  }

  async onClose() {
    this.root?.unmount();
  }
}
```

### 6.2 `TaskQueuePanel` (`src/ui/TaskQueuePanel.tsx`)

Main React component. Owns all queue state.

**Props:** `{ plugin: MindGraphPlugin }`

**State:**
- `tasks: Task[]` — ordered list of non-done tasks (fetched on mount, refreshed after mutations)
- `loading: boolean`

**Responsibilities:**
- Fetch ordered queue on mount
- Handle add, delete, mark-done, and reorder
- Render `<DndContext>` + `<SortableContext>` wrapping a list of `<TaskCard>`
- Render the "Add Task" button

### 6.3 `TaskCard` (`src/ui/TaskCard.tsx`)

A single sortable row in the queue. Uses the `useSortable` hook from `@dnd-kit/sortable` to attach drag listeners and the transform style to the row element.

**Props:**
```ts
interface TaskCardProps {
  task: Task;
  index: number;
  onDone: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
}
```

### 6.4 `TaskEditModal` (`src/ui/TaskEditModal.tsx`)

Extends Obsidian's `Modal`. Mounts a React form.

```ts
export class TaskEditModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private task: Task | null,          // null = create new
    private onSave: (task: Task) => Promise<void>,
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText(this.task ? 'Edit Task' : 'New Task');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <TaskEditForm
        task={this.task}
        onSave={async (t) => { await this.onSave(t); this.close(); }}
        onCancel={() => this.close()}
      />
    );
  }

  onClose() {
    this.root?.unmount();
  }
}
```

### 6.5 `TaskEditForm` (`src/ui/TaskEditForm.tsx`)

Pure React form. No Obsidian imports.

**Props:**
```ts
interface TaskEditFormProps {
  task: Task | null;
  onSave: (task: Task) => Promise<void>;
  onCancel: () => void;
}
```

**Fields rendered:** Title, Description (textarea), Completion Criteria (textarea), Automatable checkbox (disabled in Phase 1, visible for familiarity).

---

## 7. UI Mockups

### 7.1 Task Queue — Workspace Tab

The queue scrolls **horizontally**. Task cards have a fixed width and sit in a single row. This layout is chosen deliberately so that Phase 2+ can stack multiple project queues as additional rows beneath the global one, each scrolling independently.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Task Queue                                                          [+ Add Task]   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────  │
│  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡       │  │      ≡ ≡ ≡    │
│  │                  │  │                  │  │                  │  │               │
│  │  Fix login bug   │  │  Write unit      │  │  Update README   │  │  Deploy to    │
│  │  on mobile       │  │  tests for auth  │  │  with setup      │  │  staging …    │
│  │                  │  │                  │  │                  │  │               │
│  │          [✓] [✕] │  │          [✓] [✕] │  │          [✓] [✕] │  │       [✓] [✕] │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └─────────────  │
│                                                                                     │
│  ◄─────────────────────────────────────────────────────────────── scroll ─────────► │
└─────────────────────────────────────────────────────────────────────────────────────┘

≡ ≡ ≡  = drag handle (top of card — grabbed to reorder horizontally)
✓      = mark done button
✕      = delete button
double-click card body = open Task Edit Modal
truncated title (…) = card width is fixed; long titles wrap to two lines then clip
```

### 7.2 Task Edit Modal

```
┌─────────────────────────────────────────────────────┐
│  Edit Task                                      [✕]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Title                                              │
│  ┌─────────────────────────────────────────────┐   │
│  │ Fix login bug on mobile                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Description                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Investigate why the OAuth redirect fails    │   │
│  │ on mobile. Check the callback URL config.   │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Completion Criteria                                │
│  ┌─────────────────────────────────────────────┐   │
│  │ OAuth flow completes successfully on iOS    │   │
│  │ and Android without redirect errors.        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [ ] Can be automated  (coming in a future phase)   │
│                                                     │
│                            [Cancel]  [Save Task]    │
└─────────────────────────────────────────────────────┘
```

### 7.3 Undo Toast (mark done / delete)

```
┌───────────────────────────────────────────────────┐
│  "Fix login bug" marked as done.      [Undo]  ✕   │
└───────────────────────────────────────────────────┘
         (disappears after 5 seconds)
```

### 7.4 Undo implementation

Obsidian's `Notice` accepts a `DocumentFragment`, allowing a button to be injected:

```ts
function showUndoNotice(message: string, onUndo: () => Promise<void>) {
  const frag = document.createDocumentFragment();
  frag.appendText(message + ' ');
  const btn = document.createElement('button');
  btn.setText('Undo');
  btn.onclick = async () => {
    await onUndo();
    notice.hide();
  };
  frag.appendChild(btn);
  const notice = new Notice(frag, 5000);
}
```

---

## 8. File & Folder Structure

```
src/
  main.ts                   # registerView, addCommand, activateView
  settings.ts               # + tasksFolder setting
  types.ts                  # Task, QueueStore, MindGraphData interfaces
  ui/
    TaskQueueView.tsx        # ItemView wrapper — mounts React root
    TaskQueuePanel.tsx       # Main queue React component
    TaskCard.tsx             # Draggable task row
    TaskEditModal.tsx        # Modal wrapper — mounts React root
    TaskEditForm.tsx         # Controlled form (no Obsidian imports)
  utils/
    constants.ts             # MIND_GRAPH_ROOT, TASKS_FOLDER path constants
    taskStore.ts             # CRUD against vault .md files
    queueStore.ts            # Queue order in plugin data.json
    undoNotice.ts            # showUndoNotice helper
    taskSerializer.ts        # serializeTask / deserializeTask (YAML ↔ Task)
    ids.ts                   # generateId() using crypto.randomUUID()
```

---

## 9. Implementation Steps (Ordered)

### Step 1 — Build setup
1. Install React, react-dom, react-beautiful-dnd, and their types.
2. Update `tsconfig.json` (`jsx`, include `.tsx`).
3. Update `esbuild.config.mjs` (`jsx: 'automatic'`).
4. Verify `npm run dev` still compiles without errors.

### Step 2 — Types and interfaces
1. Create `src/types.ts` with `Task`, `QueueStore`, `MindGraphData`.

### Step 3 — Constants
1. Create `src/utils/constants.ts` with `MIND_GRAPH_ROOT` and `TASKS_FOLDER`.

### Step 4 — Storage utilities
1. Implement `src/utils/ids.ts` (`generateId`).
2. Implement `src/utils/taskSerializer.ts` (serialize/deserialize YAML ↔ Task).
3. Implement `src/utils/taskStore.ts` (create, read, update, delete, list).
4. Implement `src/utils/queueStore.ts` (getOrder, setOrder, append, remove, move).
5. Implement `src/utils/undoNotice.ts`.

### Step 5 — Task Edit form (pure React, no Obsidian)
1. Implement `src/ui/TaskEditForm.tsx`.
2. Implement `src/ui/TaskEditModal.tsx`.

### Step 6 — Task Queue panel
1. Implement `src/ui/TaskCard.tsx`.
2. Implement `src/ui/TaskQueuePanel.tsx` (DnD context, task list, add button).
3. Implement `src/ui/TaskQueueView.tsx` (ItemView wrapper).

### Step 7 — Plugin wiring
1. Update `src/main.ts`: `registerView`, `addCommand`, `addRibbonIcon`, `activateView`.

### Step 8 — Manual smoke test
1. `npm run dev`
2. Reload plugin in Obsidian.
3. Open Task Queue via ribbon/command.
4. Add a task — verify `.md` file appears in vault under `.mind-graph/Tasks/`.
5. Edit the task — verify frontmatter and body update.
6. Drag to reorder — verify order persists after panel close/reopen.
7. Mark done — verify undo toast; verify task leaves queue.
8. Delete — verify undo toast; verify file is deleted.

---

## 10. Obsidian API Reference Summary

| Need | API |
|---|---|
| Register a custom view | `this.registerView(VIEW_TYPE, creator)` in `onload` |
| Open a workspace tab | `workspace.getLeaf('tab')` then `leaf.setViewState(...)` |
| Prevent duplicate tabs | `workspace.getLeavesOfType(VIEW_TYPE)[0]` |
| Focus an existing tab | `workspace.revealLeaf(leaf)` |
| Custom view base class | `import { ItemView } from 'obsidian'` |
| Custom modal base class | `import { Modal } from 'obsidian'` |
| Create a vault file | `app.vault.create(path, content)` |
| Read a vault file | `app.vault.read(file)` |
| Modify a vault file | `app.vault.modify(file, content)` |
| Delete a vault file | `app.vault.delete(file)` |
| List files in folder | `app.vault.getAbstractFileByPath(folder)` then cast to `TFolder` and use `.children` |
| Read frontmatter | `app.metadataCache.getFileCache(file)?.frontmatter` |
| Parse YAML string | `parseYaml(str)` from `'obsidian'` |
| Stringify YAML | `stringifyYaml(obj)` from `'obsidian'` |
| Show a notice | `new Notice(stringOrFragment, timeoutMs)` |
| Persist plugin data | `this.loadData()` / `this.saveData(data)` |
| Register cleanup safely | `this.registerEvent(...)` — auto-cleaned on unload |

---

## 11. Out of Scope for Phase 1

- Project association (Phase 2)
- Backlog (Phase 2)
- Dependency graph (Phase 3)
- Agentic execution / context types (Phase 4)
- The `automatable` and `contextType` fields are **stored** in frontmatter but the UI renders them as disabled/informational — avoids a migration when Phase 4 activates them.
