# Phase 3: Dependency Management and Rendering — Implementation Plan

## Overview

Phase 3 introduces dependency relationships between tasks and a visual dependency graph. The graph is a **toggle mode within the individual project tab** — the same panel, same state, switching between the Phase 2 card row and the new graph canvas. Tasks can depend on other tasks within the same project; the queue **auto-reorders** to satisfy constraints when a new edge is created. A collapsible backlog sidebar gives drag-and-drop access to unprioritised tasks from within the graph view.

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Graph entry point | Toggle button within `ProjectQueuePanel` | Same tab, same state — card view and graph view share task/queue data; no new workspace tabs |
| Graph rendering | `@xyflow/react` + `dagre` | Eliminates manual SVG routing, pointer-event drag machinery, and coordinate conversion; dagre computes the DAG layout automatically |
| Dependency ordering enforcement | Auto-reorder queue on edge creation | User draws the relationship; the queue fixes itself — no manual reorder step required |
| Cycle detection | Block edge creation with a `Notice` error | Silent acceptance of cycles would corrupt the graph; `Notice` is the idiomatic Obsidian error surface |
| Dependency scope | Per-project only | Cross-project traversal deferred; avoids multi-project graph complexity in Phase 3 |
| Edge creation UX | React Flow `<Handle>` + `onConnect` callback | Built-in connection handles replace raw pointer-event drag machinery; same port-drag UX, less code |
| Edge removal UX | Custom React Flow edge type with `×` button via `EdgeLabelRenderer` | Same hover-to-reveal pattern; React Flow manages edge hit targets |
| Node layout | dagre TB (y = dependency depth); x overridden by queue position | y-axis shows how deep in the dependency chain a task is; x-axis shows queue order — both are visible simultaneously |
| Queue position display | `#n` badge on each task node + inert notch nodes at bottom of canvas | Notch nodes are appended to the React Flow nodes array at the same x-positions; they scroll with the canvas and need no external sync |
| Backlog in graph mode | Collapsible left sidebar with draggable pills | Keeps backlog accessible without scrolling away from graph; separate from Phase 2's `BacklogSection` which stays in card mode |
| Sidebar drag to graph | Drop on notch → insert at that queue position; if pointer is within the connection zone (right half) of an adjacent node → also create dependency edge | Single gesture handles both placement and relationship |
| Dependency data storage | `dependencies: string[]` in task frontmatter (task IDs) | Already in the Phase 1 data model; no schema migration needed |
| Reverse dependency ("depended on") | Computed at read time by scanning all project tasks | A stored reverse index would go stale on rename/delete; computing it on load is cheap at typical task counts |
| Read-only dep display in card/modal | Inline chips in `TaskCard`; labelled list in `TaskEditForm` | Informs user without allowing in-place edits; graph is the sole edit surface for relationships |

---

## 1. Data Model

### 1.1 No schema migration required

`Task.dependencies: string[]` already exists in the Phase 1 data model and has been carried forward unchanged through Phase 2. It is activated here — no frontmatter migration is needed.

### 1.2 New computed type (`src/types.ts`)

```ts
/** Reverse dependency map: taskId → IDs of tasks that depend on it */
export type DependentMap = Map<string, string[]>;
```

This type is never persisted. It is derived on the fly whenever a project's tasks are loaded and passed down the component tree as a prop.

### 1.3 Active frontmatter example

```markdown
---
id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
completed: false
completionCriteria: "…"
automatable: false
contextType: null
dependencies: ["b2c3d4e5-f6a7-8901-bcde-f12345678901"]
project: "my-project"
---

# Write docs
```

`dependencies` holds the IDs of tasks that must be completed before this task — i.e. this task's prerequisites. Using IDs (not file paths) decouples the relationship from file renames.

---

## 2. Dependency Utilities (`src/utils/graph/dependencyUtils.ts`)

All dependency logic lives in a single pure-function module with no Obsidian imports. This makes it straightforward to unit-test with plain Node.js.

```ts
/**
 * Returns true if adding the edge "fromId → toId"
 * (meaning toId depends on fromId) would create a cycle.
 */
export function wouldCreateCycle(
  tasks: Task[],
  fromId: string,
  toId: string,
): boolean

/**
 * Returns tasks in a valid execution order (all prerequisites before dependants).
 * Assumes no cycles — call wouldCreateCycle first.
 */
export function topologicalSort(tasks: Task[]): Task[]

/**
 * Returns a new queue (ordered Task[]) that satisfies all dependency constraints
 * while making the fewest positional changes to the current order.
 *
 * Algorithm:
 * 1. Build a prerequisite set for each task (transitive closure).
 * 2. Walk the current queue front-to-back.
 * 3. If a task has a prerequisite that has not yet been placed,
 *    defer it — move it immediately after that prerequisite's final position.
 * 4. Return the adjusted order.
 */
export function reorderToSatisfyDependencies(queue: Task[]): Task[]

/**
 * Builds the reverse dependency map from a flat task list.
 * Result: taskId → array of IDs of tasks that depend on it.
 */
export function buildDependentMap(tasks: Task[]): DependentMap
```

---

## 3. Graph Layout (`src/utils/graph/graphLayout.ts`)

Layout is delegated to **dagre** (`@dagrejs/dagre`). This module wraps dagre and converts its output into the `Node[]` and `Edge[]` arrays that React Flow expects.

```ts
import dagre from '@dagrejs/dagre';
import { Node, Edge } from '@xyflow/react';

export const NODE_WIDTH  = 220;
export const NODE_HEIGHT = 120;
export const NODE_STEP_X = NODE_WIDTH + 60;   // fixed column width (one column per queue position)
const NOTCH_GAP = 60;                          // vertical gap between deepest task node and notch strip

/**
 * Given a list of tasks and their queue positions, run dagre LR layout
 * and return React Flow Node and Edge arrays ready to pass to <ReactFlow>.
 *
 * dagre TB (top-to-bottom): y = dependency depth rank; x is overridden by queue position.
 * Tasks with no prerequisites appear at the top; dependants appear below them.
 * x is fixed to queueIndex × NODE_STEP_X — one column per queue position.
 * Inert notch nodes are appended at the bottom of the canvas to render the queue-position strip.
 */
export function buildFlowGraph(
  queuedTasks: Task[],   // in queue order; index + 1 = queue position
): { nodes: Node[]; edges: Edge[] }
```

**Implementation sketch:**

```ts
export function buildFlowGraph(queuedTasks: Task[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const queuedIds = new Set(queuedTasks.map(t => t.id));

  queuedTasks.forEach(task => g.setNode(task.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  queuedTasks.forEach(task =>
    task.dependencies
      .filter(depId => queuedIds.has(depId))
      .forEach(depId => g.setEdge(depId, task.id))
  );

  dagre.layout(g);

  // x fixed by queue position; y from dagre TB captures dependency depth
  const taskNodes: Node[] = queuedTasks.map((task, i) => {
    const { y } = g.node(task.id);
    return {
      id: task.id,
      type: 'taskNode',
      position: { x: i * NODE_STEP_X, y: y - NODE_HEIGHT / 2 },
      data: { task, queuePosition: i + 1 },
    };
  });

  // notch nodes sit below the deepest task node; non-interactive
  const maxY = Math.max(...taskNodes.map(n => n.position.y));
  const notchY = maxY + NODE_HEIGHT + NOTCH_GAP;

  const notchNodes: Node[] = queuedTasks.map((_, i) => ({
    id: `notch-${i + 1}`,
    type: 'notchNode',
    position: { x: i * NODE_STEP_X, y: notchY },
    data: { label: i + 1 },
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  const edges: Edge[] = queuedTasks.flatMap(task =>
    task.dependencies
      .filter(depId => queuedIds.has(depId))
      .map(depId => ({
        id: `${depId}->${task.id}`,
        source: depId,
        target: task.id,
        type: 'dependencyEdge',
        data: { sourceId: depId, targetId: task.id },
      }))
  );

  return { nodes: [...taskNodes, ...notchNodes], edges };
}
```

---

## 4. Storage API Changes (`src/utils/taskStore.ts`)

Two new methods. No existing methods change.

```ts
// Add sourceId to targetTask.dependencies and write updated frontmatter.
async addDependency(targetTask: Task, sourceId: string): Promise<void>

// Remove sourceId from targetTask.dependencies and write updated frontmatter.
async removeDependency(targetTask: Task, sourceId: string): Promise<void>
```

---

## 5. New UI Components

### 5.1 `GraphEdge` (`src/ui/graph/GraphEdge.tsx`)

A custom React Flow edge type. React Flow handles hit-testing, routing, and SVG rendering — this component only adds the `×` remove button.

```tsx
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

export function GraphEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<{ sourceId: string; targetId: string; onRemove: (sourceId: string, targetId: string) => void }>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <path className="react-flow__edge-path" d={edgePath} />
      <EdgeLabelRenderer>
        <button
          className="mg-edge-remove"
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
          onClick={() => data.onRemove(data.sourceId, data.targetId)}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
```

The `×` button is positioned at the bezier midpoint via `EdgeLabelRenderer` and hidden via CSS until the edge is hovered (`.react-flow__edge:hover .mg-edge-remove { opacity: 1 }`).

### 5.2 `GraphNode` (`src/ui/graph/GraphNode.tsx`)

A custom React Flow node type. React Flow handles positioning and drag. This component renders the card body and the connection `<Handle>` elements that enable port-drag edge creation.

```tsx
import { NodeProps, Handle, Position } from '@xyflow/react';

interface GraphNodeData {
  task: Task;
  queuePosition: number;
  allTasks: Task[];
  dependentMap: DependentMap;
  onEdit: (task: Task) => void;
  onDone: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function GraphNode({ data }: NodeProps<GraphNodeData>) {
  const { task, queuePosition, allTasks, dependentMap } = data;
  return (
    <div className="mg-graph-node">
      <Handle type="target" position={Position.Left} />

      <span className="mg-graph-node-pos">#{queuePosition}</span>
      <div className="mg-graph-node-title">{task.title}</div>

      {/* read-only dependency chips */}
      {task.dependencies.map(id => (
        <span key={id} className="mg-dep-chip mg-dep-prereq">
          ← {allTasks.find(t => t.id === id)?.title ?? id}
        </span>
      ))}
      {dependentMap.get(task.id)?.map(id => (
        <span key={id} className="mg-dep-chip mg-dep-dependent">
          → {allTasks.find(t => t.id === id)?.title ?? id}
        </span>
      ))}

      <div className="mg-graph-node-actions">
        <button onClick={() => data.onDone(task)}>✓</button>
        <button onClick={() => data.onDelete(task)}>✕</button>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

React Flow renders a `<Handle>` as a small circle on the node edge. Dragging from a source handle to a target handle triggers the canvas `onConnect` callback — no manual pointer-event machinery needed.

### 5.3 `DependencyGraphCanvas` (`src/ui/DependencyGraphCanvas.tsx`)

Wraps `<ReactFlow>` with the custom node/edge types. React Flow owns the viewport, scroll, pan, and drag — this component provides the data and the business-logic callbacks.

**Props:**
```ts
interface DependencyGraphCanvasProps {
  plugin: MindGraphPlugin;
  projectSlug: string;
  queuedTasks: Task[];
  backlogTasks: Task[];
  onQueueChange: (newOrder: Task[]) => void;
  onEdit: (task: Task) => void;
  onDone: (task: Task) => void;
  onDelete: (task: Task) => void;
}
```

**State and derived data:**
```tsx
const [nodes, setNodes, onNodesChange] = useNodesState([]);
const [edges, setEdges, onEdgesChange] = useEdgesState([]);
const dependentMap = useMemo(() => buildDependentMap(queuedTasks), [queuedTasks]);

// Rebuild React Flow graph whenever tasks or their deps change
useEffect(() => {
  const { nodes, edges } = buildFlowGraph(queuedTasks);
  setNodes(nodes.map(n =>
    n.type === 'taskNode'
      ? { ...n, data: { ...n.data, allTasks: queuedTasks, dependentMap, onEdit, onDone, onDelete } }
      : n  // notch nodes carry no callbacks
  ));
  setEdges(edges.map(e => ({ ...e, data: { ...e.data, onRemove: handleRemoveEdge } })));
}, [queuedTasks]);
```

**Edge creation (`onConnect`):**
```tsx
const onConnect = useCallback(async (connection: Connection) => {
  const { source, target } = connection;  // source is prerequisite, target depends on it
  if (wouldCreateCycle(queuedTasks, source!, target!)) {
    new Notice('Cannot create dependency: this would create a cycle.');
    return;
  }
  const targetTask = queuedTasks.find(t => t.id === target)!;
  await taskStore.addDependency(targetTask, source!);
  const updatedTasks = queuedTasks.map(t =>
    t.id === target ? { ...t, dependencies: [...t.dependencies, source!] } : t
  );
  const newQueue = reorderToSatisfyDependencies(updatedTasks);
  await queueFileStore.setQueueOrder(projectSlug, newQueue.map(t => t.filePath));
  onQueueChange(newQueue);
}, [queuedTasks]);
```

**Edge removal (`handleRemoveEdge`):**
```tsx
const handleRemoveEdge = useCallback(async (sourceId: string, targetId: string) => {
  const targetTask = queuedTasks.find(t => t.id === targetId)!;
  await taskStore.removeDependency(targetTask, sourceId);
  onQueueChange(/* refreshed tasks */);
}, [queuedTasks]);
```

**Node drag to reorder (`onNodeDragStop`):**

When a node is dragged to a new x-position, derive the intended queue position from its position relative to other nodes and update the queue order:
```tsx
const onNodeDragStop = useCallback(async (_event, node) => {
  const taskNodes = nodes.filter(n => n.type === 'taskNode');
  const sortedByX = [...taskNodes].sort((a, b) => a.position.x - b.position.x);
  const newOrder = sortedByX.map(n => queuedTasks.find(t => t.id === n.id)!);
  const reordered = reorderToSatisfyDependencies(newOrder);
  await queueFileStore.setQueueOrder(projectSlug, reordered.map(t => t.filePath));
  onQueueChange(reordered);
}, [nodes, queuedTasks]);
```

**Render:**
```tsx
const nodeTypes = useMemo(() => ({ taskNode: GraphNode, notchNode: NotchNode }), []);
const edgeTypes = useMemo(() => ({ dependencyEdge: GraphEdge }), []);

return (
  <div className="mg-graph-canvas">
    <GraphBacklogSidebar tasks={backlogTasks} onDrop={handleBacklogDrop} onEdit={onEdit} />
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
    />
  </div>
);
```

React Flow provides its own scrollable, pannable viewport — no manual scroll handling or coordinate conversion is needed.

### 5.4 `GraphBacklogSidebar` (`src/ui/GraphBacklogSidebar.tsx`)

A collapsible panel left of the graph canvas.

**Props:**
```ts
interface GraphBacklogSidebarProps {
  tasks: Task[];
  onDragStart: (taskId: string) => void;
  onDragMove: (taskId: string, pointerX: number) => void;
  onDrop: (taskId: string, pointerX: number) => void;
  onEdit: (task: Task) => void;
}
```

- Renders each backlog task as a small pill with title and an edit icon
- Pills are draggable via dnd-kit; dropping a pill calls `onDrop(taskId)` on the parent, which handles queue insertion and optional edge creation
- `[‹]` / `[›]` collapse toggle reduces sidebar to an icon strip

### 5.5 `NotchNode` (`src/ui/graph/NotchNode.tsx`)

An inert React Flow node type. Renders just a queue-position label at the bottom of the canvas. React Flow positions it automatically because it is included in the `nodes` array returned by `buildFlowGraph` — no external scroll sync is needed.

```tsx
import { NodeProps } from '@xyflow/react';

export function NotchNode({ data }: NodeProps<{ label: number }>) {
  return <div className="mg-notch-label">#{data.label}</div>;
}
```

`draggable`, `selectable`, and `connectable` are set to `false` in `buildFlowGraph` so React Flow never treats these as interactive nodes.

---

## 6. Changes to Existing Components

### 6.1 `ProjectQueuePanel` (`src/ui/ProjectQueuePanel.tsx`)

**New state:** `viewMode: 'cards' | 'graph'` (default `'cards'`)

**Header change:** Add a segmented toggle button pair:

```
[≡ Cards]  [⬡ Graph]
```

**Render branch:**
```tsx
{viewMode === 'graph'
  ? (
    <DependencyGraphCanvas
      plugin={plugin}
      projectSlug={projectSlug}
      queuedTasks={queuedTasks}
      backlogTasks={backlogTasks}
      onQueueChange={handleQueueChange}
      onEdit={openEditModal}
      onDone={handleTaskDone}
      onDelete={handleTaskDelete}
    />
  )
  : (
    <>
      {/* existing horizontal card row */}
      <BacklogSection tasks={backlogTasks} … />
    </>
  )
}
```

`BacklogSection` is conditionally rendered only in card mode — the graph mode has its own sidebar.

### 6.2 `TaskCard` (`src/ui/TaskCard.tsx`)

**New prop:** `dependentMap: DependentMap`

**New read-only section** in the card body, rendered only when there are relationships:

```tsx
{task.dependencies.length > 0 && (
  <div className="mg-dep-chips">
    {task.dependencies.map(id => (
      <span key={id} className="mg-dep-chip mg-dep-prereq">
        ← {allTasks.find(t => t.id === id)?.title ?? id}
      </span>
    ))}
  </div>
)}
{(dependentMap.get(task.id)?.length ?? 0) > 0 && (
  <div className="mg-dep-chips">
    {dependentMap.get(task.id)!.map(id => (
      <span key={id} className="mg-dep-chip mg-dep-dependent">
        → {allTasks.find(t => t.id === id)?.title ?? id}
      </span>
    ))}
  </div>
)}
```

### 6.3 `TaskEditForm` (`src/ui/TaskEditForm.tsx`)

**New props:** `allTasks: Task[]`, `dependentMap: DependentMap`

**New read-only section** before the Save/Cancel buttons:

```tsx
{(task?.dependencies.length || dependentMap.get(task?.id)?.length) && (
  <div className="mg-dep-section">
    <p className="mg-dep-label">Dependencies (edit in Graph view)</p>
    {task.dependencies.map(id => <div key={id}>← {resolveTitle(id)}</div>)}
    <p className="mg-dep-label">Depended on by</p>
    {dependentMap.get(task.id)?.map(id => <div key={id}>→ {resolveTitle(id)}</div>)}
  </div>
)}
```

---

## 7. UI Mockups

### 7.1 Graph View Toggle (header)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Queue: ObsidianMindGraph        [≡ Cards] [⬡ Graph]   [+ Add Task]  [✎] [✕]        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Dependency Graph — Full View

```
┌────────────┬─────────────────────────────────────────────────────────────────────────┐
│  BACKLOG   │                                                                         │
│  [‹]       │  ┌──────────────┐                                                      │
│            │  │ #1           │                                                      │
│ ┌────────┐ │  │ Refactor     │─────────────────────────┐                           │
│ │Survey  │ │  │ queue store  │──────────┐              │                           │
│ │anim…   │ │  │      [✓] [✕] │          │              │                           │
│ └────────┘ │  └──────────────┘          │              │                           │
│ ┌────────┐ │                            ▼              ▼                           │
│ │Investi-│ │              ┌──────────────┐    ┌──────────────┐                     │
│ │gate    │ │              │ #2           │    │ #3           │                     │
│ │mobile  │ │              │ Write docs   │    │ Add project  │                     │
│ └────────┘ │              │      [✓][✕] │    │ UI  [✓][✕]  │                     │
│            │              └──────────────┘    └──────────────┘                     │
│            │                                                                        │
│            │  ┌──┐              ┌──┐              ┌──┐                             │
│            │  │#1│              │#2│              │#3│  ← inert notch nodes        │
│            │  └──┘              └──┘              └──┘                             │
│            │                                                                        │
│            │  ◄──────────────────────────────── scroll ──────────────────────────► │
└────────────┴─────────────────────────────────────────────────────────────────────────┘

x-axis = queue position (one fixed column per task, spaced by NODE_STEP_X)
y-axis = dependency depth (dagre TB; tasks with no prerequisites at top, dependants below)
Notch nodes (#1 #2 #3) scroll with the canvas — no external sync required
```

### 7.3 Port-Drag Edge Creation

```
Before drag:
  ┌──────────────────┐
  │ Refactor queue   │●  ← port handle (appears on hover)
  └──────────────────┘

During drag:
  ┌──────────────────┐
  │ Refactor queue   │●─────────────────── (ghost line) ──────►  (pointer)
  └──────────────────┘

On release over target:
  ┌──────────────────┐                        ┌──────────────────┐
  │ Refactor queue   │───────────────────────►│ Write docs       │
  │                  │                        │ ← Refactor queue │
  └──────────────────┘                        └──────────────────┘
```

### 7.4 Edge Removal

```
  ┌──────────────────┐                        ┌──────────────────┐
  │ Refactor queue   │────────── [×] ─────────│ Write docs       │
  └──────────────────┘          ↑             └──────────────────┘
                          hover to reveal;
                          click × to delete
```

### 7.5 Backlog Sidebar Drag to Graph

```
  BACKLOG              1                   2                   3
  
  ┌──────────┐  ┌─────────────┐    ┌─────────────┐    ╔═════════════╗
  │ Survey   │  │ Refactor    │    │ Write docs  │    ║  [drop here] ║  ← highlighted notch
  │ anim…    ├──┤             ├──►─┤             ├──►─║  + link from ║
  │ dragging │  │             │    │             │    ║  "Write docs"║
  └──────────┘  └─────────────┘    └─────────────┘    ╚═════════════╝
  
  Connection zone glows when pill is over the right half of an occupied column
  → on drop: task inserted at position 3, dependency edge from "Write docs" created
```

### 7.6 Node Drag to Reorder (no dependency)

Dragging a node by its **body** (title area) moves it to a new queue position. No dependency edge is created. The port handle (●) is the only gesture that triggers edge creation — grabbing anywhere else on the node initiates a position reorder.

```
Before drag:

  1                   2                   3                   4
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │ Refactor    │    │ Write docs  │    │ Add project │    │ Deploy      │
  │             │    │             │    │ UI          │    │             │
  │     [✓] [✕] │    │     [✓] [✕] │    │     [✓] [✕] │    │     [✓] [✕] │
  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

During drag — "Write docs" grabbed by body, dragged toward notch 4:

  1                   2                   3                   4
  ┌─────────────┐    ┌ ─ ─ ─ ─ ─ ─ ┐    ┌─────────────┐    ╔═════════════╗
  │ Refactor    │    │  (vacancy)   │    │ Add project │    ║ Write docs  ║ ← dragging
  │             │    │              │    │ UI          │    ║             ║
  │     [✓] [✕] │    │              │    │     [✓] [✕] │    ║     [✓] [✕] ║
  └─────────────┘    └ ─ ─ ─ ─ ─ ─ ┘    └─────────────┘    ╚═════════════╝

  Notch 4 highlighted (plain drop zone — no connection-zone glow).
  Pointer is in the open centre of the column, not the right-half of notch 3.

After drop:

  1                   2                   3                   4
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │ Refactor    │    │ Add project │    │ Deploy      │    │ Write docs  │
  │             │    │ UI          │    │             │    │             │
  │     [✓] [✕] │    │     [✓] [✕] │    │     [✓] [✕] │    │     [✓] [✕] │
  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

  No new edges. Nodes 3 and 4 shifted left to fill the vacancy.
  queue.md is rewritten with the new order.
```

### 7.7 Updated TaskCard (card view)

```
┌──────────────────┐
│      ≡ ≡ ≡       │
│                  │
│  Write docs      │
│                  │
│  ← Refactor      │   (prerequisite chip)
│                  │
│          [✓] [✕] │
└──────────────────┘
```

### 7.8 Updated Task Edit Modal (dependencies section)

```
  …
  │  [ ] Can be automated  (coming in a future phase)   │
  │                                                     │
  │  Dependencies  (edit in Graph view)                 │
  │    ← Refactor queue store                           │
  │                                                     │
  │  Depended on by                                     │
  │    → Deploy to staging                              │
  │                                                     │
  │                            [Cancel]  [Save Task]    │
  └─────────────────────────────────────────────────────┘
```

---

## 8. File & Folder Structure

```
src/
  types.ts                          # + DependentMap type
  ui/
    ProjectQueuePanel.tsx            # Updated: viewMode state + toggle button + conditional graph render
    TaskCard.tsx                     # Updated: dependency chips (read-only), new dependentMap prop
    TaskEditForm.tsx                 # Updated: read-only dependency section, new allTasks + dependentMap props
    DependencyGraphCanvas.tsx        # NEW — ReactFlow wrapper: onConnect, onNodeDragStop, backlog drop
    graph/
      GraphNode.tsx                  # NEW — React Flow custom node type (Handles, dep chips, done/delete)
      GraphEdge.tsx                  # NEW — React Flow custom edge type (bezier + hover × button)
      GraphBacklogSidebar.tsx        # NEW — collapsible left sidebar with draggable backlog pills
      NotchNode.tsx                  # NEW — inert React Flow node type rendering a queue-position label
  utils/
    graph/
      dependencyUtils.ts             # NEW — wouldCreateCycle, topologicalSort, reorderToSatisfyDependencies, buildDependentMap
      graphLayout.ts                 # NEW — buildFlowGraph (dagre layout → React Flow Node[]/Edge[])
    taskStore.ts                     # Updated: addDependency, removeDependency
```

---

## 9. Implementation Steps (Ordered)

### Step 1 — Install dependencies
```bash
npm install @xyflow/react @dagrejs/dagre
npm install -D @types/dagre
```

### Step 2 — Types
1. Add `DependentMap` type to `src/types.ts`.

### Step 3 — Dependency utilities
1. Implement `src/utils/graph/dependencyUtils.ts` (`wouldCreateCycle`, `topologicalSort`, `reorderToSatisfyDependencies`, `buildDependentMap`).
2. Write standalone unit tests (no Obsidian imports needed — pure functions over `Task[]`).

### Step 4 — dagre layout wrapper
1. Implement `src/utils/graph/graphLayout.ts` (`buildFlowGraph` — runs dagre and returns `{ nodes, edges }` for React Flow).
2. Manually verify with a few hand-crafted task arrays; check that node positions look correct before wiring into the UI.

### Step 5 — `taskStore` dependency methods
1. Add `addDependency(targetTask, sourceId)` to `src/utils/taskStore.ts`.
2. Add `removeDependency(targetTask, sourceId)` to `src/utils/taskStore.ts`.

### Step 6 — `GraphEdge` custom edge type
1. Implement `src/ui/graph/GraphEdge.tsx` (bezier path via `getBezierPath` + hover `×` via `EdgeLabelRenderer`).

### Step 7 — Custom node types
1. Implement `src/ui/graph/GraphNode.tsx` (task card body, `<Handle>` source/target, dep chips, done/delete buttons).
2. Implement `src/ui/graph/NotchNode.tsx` (single `div` with `className="mg-notch-label"` rendering `#{data.label}`).

### Step 8 — `GraphBacklogSidebar`
1. Implement `src/ui/graph/GraphBacklogSidebar.tsx` (pill list, collapse toggle, dnd-kit drag).

### Step 9 — `DependencyGraphCanvas`
1. Implement `src/ui/DependencyGraphCanvas.tsx`:
   - Wire `buildFlowGraph` output into `useNodesState` / `useEdgesState`.
   - Implement `onConnect`: cycle check → `addDependency` → `reorderToSatisfyDependencies` → persist.
   - Implement `onNodeDragStop`: derive new queue order from final x-positions → `reorderToSatisfyDependencies` → persist.
   - Implement `handleRemoveEdge`: `removeDependency` → persist.
   - Implement `handleBacklogDrop`: remove from backlog → insert into queue → optional edge creation.
   - Register `nodeTypes` and `edgeTypes`; render `<ReactFlow>`.

### Step 10 — Update existing components
1. Update `src/ui/ProjectQueuePanel.tsx`: `viewMode` state, toggle button, conditional render, hide `BacklogSection` in graph mode.
2. Update `src/ui/TaskCard.tsx`: dependency chip rows, new `dependentMap` prop.
3. Update `src/ui/TaskEditForm.tsx`: read-only dependency section, new `allTasks` + `dependentMap` props.

### Step 11 — Manual smoke test
1. `npm run dev`; reload plugin.
2. Open a project with ≥ 3 queued tasks; switch to Graph view — verify nodes render and dagre positions them correctly.
3. Drag from a node's source handle to another node's target handle — verify edge appears, queue reorders, and the target task's frontmatter lists the source ID in `dependencies`.
4. Attempt circular dependency (A → B then B → A) — verify the second connection is blocked with a `Notice`.
5. Hover over an edge and click `×` — verify edge disappears and frontmatter updates.
6. Drag a node to a new position — verify queue order in `queue.md` updates to match the new x-ordering.
7. Drag a backlog pill onto the graph — verify it is removed from `backlog.md` and appears in `queue.md`.
8. Switch to card view — verify dependency chips appear on `TaskCard` components.
9. Open task edit modal for a task with dependencies — verify the read-only section shows correct titles.

---

## 10. Obsidian API Reference Additions

No new Obsidian APIs are required in Phase 3. React Flow and dagre are self-contained; all storage operations use the existing `taskStore` and `queueFileStore` methods from Phases 1–2.

---

## 11. Out of Scope for Phase 3

- Cross-project dependencies (deferred)
- Dependency-aware agent scheduling (Phase 4)
- Keyboard-driven edge creation (accessibility improvement, post-Phase 3)
- Graph minimap for projects with large task counts
- Bulk dependency import/export
- The `automatable` and `contextType` fields remain stored in frontmatter and disabled in the UI
