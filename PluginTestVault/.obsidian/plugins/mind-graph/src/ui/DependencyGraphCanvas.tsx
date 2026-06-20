import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import {
	ReactFlow,
	useNodesState,
	useEdgesState,
	type Connection,
	type Edge,
	type Node,
	type OnNodeDrag,
} from '@xyflow/react';
import { type Task } from '../types';
import { type TaskStore } from '../utils/taskStore';
import { type QueueFileStore } from '../utils/queueFileStore';
import { buildFlowGraph, NODE_STEP_X, NODE_WIDTH } from '../utils/graph/graphLayout';
import {
	buildDependentMap,
	reorderToSatisfyDependencies,
	wouldCreateCycle,
} from '../utils/graph/dependencyUtils';
import { GraphNode } from './graph/GraphNode';
import { GraphEdge } from './graph/GraphEdge';
import { NotchNode } from './graph/NotchNode';
import { GraphBacklogSidebar } from './graph/GraphBacklogSidebar';

interface DependencyGraphCanvasProps {
	taskStore: TaskStore;
	queueFileStore: QueueFileStore;
	projectSlug: string;
	queuedTasks: Task[];
	backlogTasks: Task[];
	onQueueChange: (newOrder: Task[]) => void;
	onEdit: (task: Task) => void;
	onDone: (task: Task) => void;
	onDelete: (task: Task) => void;
}

// Minimal slice of the React Flow instance we use in handlers
type RFInstance = {
	screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
};

export function DependencyGraphCanvas({
	taskStore,
	queueFileStore,
	projectSlug,
	queuedTasks,
	backlogTasks,
	onQueueChange,
	onEdit,
	onDone,
	onDelete,
}: DependencyGraphCanvasProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const rfInstance = useRef<RFInstance | null>(null);
	const [connectionZoneNodeId, setConnectionZoneNodeId] = useState<string | null>(null);

	const dependentMap = useMemo(() => buildDependentMap(queuedTasks), [queuedTasks]);

	const handleRemoveEdge = useCallback(async (sourceId: string, targetId: string) => {
		const targetTask = queuedTasks.find(t => t.id === targetId);
		if (!targetTask) return;
		await taskStore.removeDependency(targetTask, sourceId);
		const updatedTasks = queuedTasks.map(t =>
			t.id === targetId
				? { ...t, dependencies: t.dependencies.filter(id => id !== sourceId) }
				: t,
		);
		onQueueChange(updatedTasks);
	}, [queuedTasks, taskStore, onQueueChange]);

	// Rebuild React Flow graph whenever tasks or their deps change
	useEffect(() => {
		const { nodes: rawNodes, edges: rawEdges } = buildFlowGraph(queuedTasks);
		setNodes(rawNodes.map(n =>
			n.type === 'taskNode'
				? { ...n, data: { ...n.data, allTasks: queuedTasks, dependentMap, onEdit, onDone, onDelete } }
				: n, // notch nodes carry no callbacks
		));
		setEdges(rawEdges.map(e => ({ ...e, data: { ...e.data, onRemove: handleRemoveEdge } })));
	}, [queuedTasks, dependentMap, handleRemoveEdge]);

	const onConnect = useCallback((connection: Connection) => {
		const { source, target } = connection;
		if (!source || !target) return;
		if (wouldCreateCycle(queuedTasks, source, target)) {
			new Notice('Cannot create dependency: this would create a cycle.');
			return;
		}
		const targetTask = queuedTasks.find(t => t.id === target);
		if (!targetTask) return;
		void (async () => {
			await taskStore.addDependency(targetTask, source);
			const updatedTasks = queuedTasks.map(t =>
				t.id === target ? { ...t, dependencies: [...t.dependencies, source] } : t,
			);
			const newQueue = reorderToSatisfyDependencies(updatedTasks);
			await queueFileStore.setQueueOrder(projectSlug, newQueue.map(t => t.filePath));
			onQueueChange(newQueue);
		})();
	}, [queuedTasks, taskStore, queueFileStore, projectSlug, onQueueChange]);

	const onNodeDragStop: OnNodeDrag = useCallback((_event, _node) => {
		const taskNodes = nodes.filter(n => n.type === 'taskNode');
		const sortedByX = [...taskNodes].sort((a, b) => a.position.x - b.position.x);
		const newOrder = sortedByX
			.map(n => queuedTasks.find(t => t.id === n.id))
			.filter((t): t is Task => t !== undefined);
		const reordered = reorderToSatisfyDependencies(newOrder);
		void (async () => {
			await queueFileStore.setQueueOrder(projectSlug, reordered.map(t => t.filePath));
			onQueueChange(reordered);
		})();
	}, [nodes, queuedTasks, queueFileStore, projectSlug, onQueueChange]);

	const handleBacklogDrop = useCallback((taskId: string, pointerX: number) => {
		const task = backlogTasks.find(t => t.id === taskId);
		if (!task) return;

		const flowX = rfInstance.current?.screenToFlowPosition({ x: pointerX, y: 0 }).x ?? 0;

		// Which column is the pointer over, and where within that column?
		const colIndex = Math.floor(flowX / NODE_STEP_X);
		const posInCol = flowX - colIndex * NODE_STEP_X;

		// "Connection zone" = right half of an occupied column
		const inConnectionZone =
			posInCol > NODE_WIDTH / 2 &&
			posInCol <= NODE_WIDTH &&
			colIndex >= 0 &&
			colIndex < queuedTasks.length;

		// Insert after the hovered column when in the connection zone,
		// otherwise round to the nearest slot
		const targetIndex = inConnectionZone
			? colIndex + 1
			: Math.max(0, Math.min(queuedTasks.length, Math.round(flowX / NODE_STEP_X)));

		const predecessorId = inConnectionZone ? queuedTasks[colIndex]?.id : undefined;

		void (async () => {
			await queueFileStore.removeFromBacklog(projectSlug, task.filePath);
			await queueFileStore.insertInQueue(projectSlug, task.filePath, targetIndex);

			if (predecessorId) {
				await taskStore.addDependency(task, predecessorId);
			}

			const newTask = predecessorId
				? { ...task, dependencies: [...task.dependencies, predecessorId] }
				: task;

			const newQueue = [...queuedTasks];
			newQueue.splice(targetIndex, 0, newTask);
			const reordered = reorderToSatisfyDependencies(newQueue);
			await queueFileStore.setQueueOrder(projectSlug, reordered.map(t => t.filePath));
			onQueueChange(reordered);
		})();
	}, [backlogTasks, queuedTasks, taskStore, queueFileStore, projectSlug, onQueueChange]);

	const handleDragMove = useCallback((pointerX: number) => {
		const flowX = rfInstance.current?.screenToFlowPosition({ x: pointerX, y: 0 }).x ?? 0;
		const colIndex = Math.floor(flowX / NODE_STEP_X);
		const posInCol = flowX - colIndex * NODE_STEP_X;
		const inZone =
			posInCol > NODE_WIDTH / 2 &&
			posInCol <= NODE_WIDTH &&
			colIndex >= 0 &&
			colIndex < queuedTasks.length;
		const newId = inZone ? (queuedTasks[colIndex]?.id ?? null) : null;
		setConnectionZoneNodeId(prev => (prev === newId ? prev : newId));
	}, [queuedTasks]);

	// Apply/remove connection-zone highlight on the target node
	useEffect(() => {
		setNodes(prev => prev.map(n => {
			if (n.type !== 'taskNode') return n;
			const want = n.id === connectionZoneNodeId;
			const has = !!(n.data as Record<string, unknown>).isConnectionTarget;
			if (want === has) return n;
			return { ...n, data: { ...n.data, isConnectionTarget: want } };
		}));
	}, [connectionZoneNodeId]);

	const nodeTypes = useMemo(() => ({ taskNode: GraphNode, notchNode: NotchNode }), []);
	const edgeTypes = useMemo(() => ({ dependencyEdge: GraphEdge }), []);

	return (
		<div className="mg-graph-canvas">
			<GraphBacklogSidebar
				tasks={backlogTasks}
				onDrop={handleBacklogDrop}
				onDragMove={handleDragMove}
				onDragEnd={() => setConnectionZoneNodeId(null)}
				onEdit={onEdit}
			/>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeDragStop={onNodeDragStop}
				onInit={instance => { rfInstance.current = instance; }}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				fitView
			/>
		</div>
	);
}
