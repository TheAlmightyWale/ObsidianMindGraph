import React from 'react';
import { Task } from '../types';
import { truncateDescription } from '../utils/descriptionPreview';

interface BacklogSectionProps {
	tasks: Task[];
	onPromote: (task: Task) => void;
	onEdit: (task: Task) => void;
	onDelete: (task: Task) => void;
}

export function BacklogSection({ tasks, onPromote, onEdit, onDelete }: BacklogSectionProps) {
	return (
		<div className="mg-backlog">
			<h4 className="mg-backlog__title">Backlog</h4>
			{tasks.length === 0 ? (
				<p className="mg-backlog__empty">No tasks in backlog.</p>
			) : (
				<div className="mg-backlog__list">
					{tasks.map(task => (
						<div key={task.id} className="mg-backlog__row">
							<div className="mg-backlog__task-info">
								<span className="mg-backlog__task-title">{task.title}</span>
								{task.description && (
									<span className="mg-backlog__task-desc">{truncateDescription(task.description)}</span>
								)}
							</div>
							<div className="mg-backlog__actions">
								<button onClick={() => onPromote(task)} title="Add to queue">
									→ Queue
								</button>
								<button onClick={() => onEdit(task)} title="Edit task">
									✎
								</button>
								<button onClick={() => onDelete(task)} title="Delete task">
									✕
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
