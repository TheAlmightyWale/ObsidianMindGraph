import React from 'react';
import { type Task, type DependentMap } from '../types';

interface DepChipsProps {
	task: Task;
	allTasks: Task[];
	dependentMap: DependentMap;
}

export function DepChips({ task, allTasks, dependentMap }: DepChipsProps) {
	const prereqs = task.dependencies;
	const dependents = dependentMap.get(task.id) ?? [];

	return (
		<>
			{prereqs.length > 0 && (
				<div className="mg-dep-chips">
					{prereqs.map(id => (
						<span key={id} className="mg-dep-chip mg-dep-prereq">
							← {allTasks.find(t => t.id === id)?.title ?? id}
						</span>
					))}
				</div>
			)}
			{dependents.length > 0 && (
				<div className="mg-dep-chips">
					{dependents.map(id => (
						<span key={id} className="mg-dep-chip mg-dep-dependent">
							→ {allTasks.find(t => t.id === id)?.title ?? id}
						</span>
					))}
				</div>
			)}
		</>
	);
}
