import React, { useEffect, useState } from 'react';
import {
	DndContext,
	closestCenter,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
	SortableContext,
	horizontalListSortingStrategy,
	arrayMove,
} from '@dnd-kit/sortable';
import { App } from 'obsidian';
import { Task } from '../types';
import { DEFAULT_PROJECT_SLUG } from '../utils/constants';
import { QueueFileStore } from '../utils/queueFileStore';
import { TaskStore } from '../utils/taskStore';
import { showUndoNotice } from '../utils/undoNotice';
import { TaskCard } from './TaskCard';
import { TaskEditModal } from './TaskEditModal';

interface TaskQueuePanelProps {
	app: App;
	taskStore: TaskStore;
	queueFileStore: QueueFileStore;
	projectSlug?: string;
	projectName?: string;        // display name shown in the header link (overview mode)
	onProjectNameClick?: () => void; // when provided, name becomes a clickable link
}

export function TaskQueuePanel({
	app,
	taskStore,
	queueFileStore,
	projectSlug = DEFAULT_PROJECT_SLUG,
	projectName,
	onProjectNameClick,
}: TaskQueuePanelProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);

	const sensors = useSensors(useSensor(PointerSensor));

	useEffect(() => {
		void taskStore.getQueue(projectSlug).then(queue => {
			setTasks(queue);
			setLoading(false);
		});
	}, [projectSlug]);

	function refreshQueue() {
		void taskStore.getQueue(projectSlug).then(setTasks);
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = tasks.findIndex(t => t.id === String(active.id));
		const newIndex = tasks.findIndex(t => t.id === String(over.id));
		if (oldIndex === -1 || newIndex === -1) return;
		setTasks(prev => arrayMove(prev, oldIndex, newIndex));
		void queueFileStore.moveInQueue(projectSlug, oldIndex, newIndex);
	}

	function openAddModal() {
		new TaskEditModal(app, null, async (t) => {
			const created = await taskStore.createTask(t.title, projectSlug, 'queue');
			if (t.description || t.completionCriteria) {
				await taskStore.updateTask({
					...created,
					description: t.description,
					completionCriteria: t.completionCriteria,
				});
			}
			refreshQueue();
		}).open();
	}

	function openEditModal(task: Task) {
		new TaskEditModal(app, task, async (updated) => {
			await taskStore.updateTask(updated);
			refreshQueue();
		}).open();
	}

	async function handleDone(task: Task) {
		await taskStore.updateTask({ ...task, completed: true });
		await queueFileStore.removeFromQueue(projectSlug, task.filePath);
		setTasks(prev => prev.filter(t => t.id !== task.id));
		showUndoNotice(`"${task.title}" marked as done.`, async () => {
			await taskStore.updateTask({ ...task, completed: false });
			await queueFileStore.appendToQueue(projectSlug, task.filePath);
			refreshQueue();
		});
	}

	async function handleDelete(task: Task) {
		const snapshot = { ...task };
		const originalIndex = tasks.findIndex(t => t.id === task.id);
		await taskStore.deleteTask(task);
		setTasks(prev => prev.filter(t => t.id !== task.id));
		showUndoNotice(`"${snapshot.title}" deleted.`, async () => {
			const restored = await taskStore.createTaskFile(snapshot);
			await queueFileStore.insertInQueue(projectSlug, restored.filePath, originalIndex);
			refreshQueue();
		});
	}

	if (loading) {
		return <div className="mg-queue-loading">Loading…</div>;
	}

	return (
		<div className="mg-task-queue">
			<div className="mg-task-queue__header">
				{onProjectNameClick && (
					<button className="mg-project-name-link" onClick={onProjectNameClick}>
						{projectName ?? projectSlug}
					</button>
				)}
				<button onClick={openAddModal} className="mod-cta">+ Add Task</button>
			</div>
			<div className="mg-queue-body">
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={tasks.map(t => t.id)}
						strategy={horizontalListSortingStrategy}
					>
						<div className="mg-task-queue__list">
							{tasks.map((task, i) => (
								<TaskCard
									key={task.id}
									task={task}
									index={i}
									onDone={t => void handleDone(t)}
									onDelete={t => void handleDelete(t)}
									onEdit={openEditModal}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			</div>
		</div>
	);
}
