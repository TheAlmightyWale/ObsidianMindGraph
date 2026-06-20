import React from 'react';
import { type Task, type DependentMap } from '../types';
import { truncateDescription } from '../utils/descriptionPreview';
import { DepChips } from './DepChips';

interface TaskCardBodyProps {
	task: Task;
	allTasks: Task[];
	dependentMap: DependentMap;
}

export function TaskCardBody({ task, allTasks, dependentMap }: TaskCardBodyProps) {
	return (
		<>
			<div className="mg-task-card__title">{task.title}</div>
			{task.description && (
				<div className="mg-task-card__desc">{truncateDescription(task.description)}</div>
			)}
			<DepChips task={task} allTasks={allTasks} dependentMap={dependentMap} />
		</>
	);
}
