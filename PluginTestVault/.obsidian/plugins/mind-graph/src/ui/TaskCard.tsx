import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Task, type DependentMap } from '../types';
import { TaskCardBody } from './TaskCardBody';

interface TaskCardProps {
	task: Task;
	index: number;
	onDone: (task: Task) => void;
	onDelete: (task: Task) => void;
	onEdit: (task: Task) => void;
	onDemote?: (task: Task) => void;
	allTasks?: Task[];
	dependentMap?: DependentMap;
}

export function TaskCard({ task, onDone, onDelete, onEdit, onDemote, allTasks, dependentMap }: TaskCardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: task.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`mg-task-card${isDragging ? ' mg-task-card--dragging' : ''}`}
			onDoubleClick={() => onEdit(task)}
		>
			<div className="mg-task-card__handle" {...attributes} {...listeners}>
				≡
			</div>
			<TaskCardBody
				task={task}
				allTasks={allTasks ?? []}
				dependentMap={dependentMap ?? new Map()}
			/>
			<div className="mg-task-card__actions">
				{onDemote && (
					<button
						onClick={e => { e.stopPropagation(); onDemote(task); }}
						onDoubleClick={e => e.stopPropagation()}
						aria-label="Move to backlog"
						className="mg-btn-demote"
					>↓</button>
				)}
				<button
					onClick={e => { e.stopPropagation(); onDone(task); }}
					onDoubleClick={e => e.stopPropagation()}
					aria-label="Mark done"
					className="mg-btn-done"
				>✓</button>
				<button
					onClick={e => { e.stopPropagation(); onDelete(task); }}
					onDoubleClick={e => e.stopPropagation()}
					aria-label="Delete"
					className="mg-btn-delete"
				>✕</button>
			</div>
		</div>
	);
}
