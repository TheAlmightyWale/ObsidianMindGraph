import React from 'react';
import { type Node, type NodeProps, Handle, Position } from '@xyflow/react';
import { type Task, type DependentMap } from '../../types';

type GraphNodeData = Record<string, unknown> & {
	task: Task;
	queuePosition: number;
	allTasks: Task[];
	dependentMap: DependentMap;
	isConnectionTarget?: boolean;
	onEdit: (task: Task) => void;
	onDone: (task: Task) => void;
	onDelete: (task: Task) => void;
};

export type GraphNodeType = Node<GraphNodeData>;

export function GraphNode({ data }: NodeProps<GraphNodeType>) {
	if (!data) return null;
	const { task, queuePosition, allTasks, dependentMap, isConnectionTarget } = data;

	return (
		<div className={`mg-task-card${isConnectionTarget ? ' mg-task-card--connection-target' : ''}`}>
			<Handle type="target" position={Position.Left} />

			<div className="mg-task-card__handle">#{queuePosition}</div>
			<div className="mg-task-card__title">{task.title}</div>
			{task.description && (
				<div className="mg-task-card__desc">
					{task.description.replace(/\s+/g, ' ').slice(0, 80)}
					{task.description.length > 80 ? '…' : ''}
				</div>
			)}

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

			<div className="mg-task-card__actions">
				<button onClick={() => data.onEdit(task)} aria-label="Edit" className="mg-btn-edit">✎</button>
				<button onClick={() => data.onDone(task)} aria-label="Mark done" className="mg-btn-done">✓</button>
				<button onClick={() => data.onDelete(task)} aria-label="Delete" className="mg-btn-delete">✕</button>
			</div>

			<Handle type="source" position={Position.Right} />
		</div>
	);
}
