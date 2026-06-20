import dagre from '@dagrejs/dagre';
import { type Node, type Edge } from '@xyflow/react';
import { type Task } from '../../types';

export const NODE_WIDTH  = 220;
export const NODE_HEIGHT = 120;
export const NODE_STEP_X = NODE_WIDTH + 60;  // one fixed column per queue position

const NOTCH_GAP = 60;  // vertical gap between deepest task node and notch strip

/**
 * Given a list of tasks in queue order, run dagre TB layout and return
 * React Flow Node and Edge arrays ready to pass to <ReactFlow>.
 *
 * dagre TB (top-to-bottom): y = dependency depth rank; x is overridden by queue position.
 * Tasks with no prerequisites appear at the top; dependants appear below them.
 * x is fixed to queueIndex × NODE_STEP_X — one column per queue position.
 * Inert notch nodes are appended at the bottom of the canvas to render the queue-position strip.
 */
export function buildFlowGraph(
	queuedTasks: Task[],
): { nodes: Node[]; edges: Edge[] } {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
	g.setDefaultEdgeLabel(() => ({}));

	const queuedIds = new Set(queuedTasks.map(t => t.id));

	queuedTasks.forEach(task =>
		g.setNode(task.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
	);
	queuedTasks.forEach(task =>
		task.dependencies
			.filter(depId => queuedIds.has(depId))
			.forEach(depId => g.setEdge(depId, task.id)),
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

	// notch nodes sit below the deepest task node and are not interactive
	const maxY = taskNodes.length > 0
		? Math.max(...taskNodes.map(n => n.position.y))
		: 0;
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
			})),
	);

	return { nodes: [...taskNodes, ...notchNodes], edges };
}
