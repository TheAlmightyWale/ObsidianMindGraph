import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Task, type DependentMap } from '../types';

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
			<div className="mg-task-card__title">{task.title}</div>
			{task.description && (
				<div className="mg-task-card__desc">
					{task.description.replace(/\s+/g, ' ').slice(0, 80)}
					{task.description.length > 80 ? '…' : ''}
				</div>
			)}
			{allTasks && task.dependencies.length > 0 && (
				<div className="mg-dep-chips">
					{task.dependencies.map(id => (
						<span key={id} className="mg-dep-chip mg-dep-prereq">
							← {allTasks.find(t => t.id === id)?.title ?? id}
						</span>
					))}
				</div>
			)}
			{allTasks && dependentMap && (dependentMap.get(task.id)?.length ?? 0) > 0 && (
				<div className="mg-dep-chips">
					{dependentMap.get(task.id)!.map(id => (
						<span key={id} className="mg-dep-chip mg-dep-dependent">
							→ {allTasks.find(t => t.id === id)?.title ?? id}
						</span>
					))}
				</div>
			)}
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
