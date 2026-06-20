import React from 'react';
import { type Node, type NodeProps, Handle, Position } from '@xyflow/react';
import { type Task, type DependentMap } from '../../types';
import { TaskCardBody } from '../TaskCardBody';

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
			<TaskCardBody task={task} allTasks={allTasks} dependentMap={dependentMap} />

			<div className="mg-task-card__actions">
				<button onClick={() => data.onEdit(task)} aria-label="Edit" className="mg-btn-edit">✎</button>
				<button onClick={() => data.onDone(task)} aria-label="Mark done" className="mg-btn-done">✓</button>
				<button onClick={() => data.onDelete(task)} aria-label="Delete" className="mg-btn-delete">✕</button>
			</div>

			<Handle type="source" position={Position.Right} />
		</div>
	);
}
