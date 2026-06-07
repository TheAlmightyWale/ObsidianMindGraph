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
import { QueueOrderStore } from '../utils/queueStore';
import { TaskStore } from '../utils/taskStore';
import { showUndoNotice } from '../utils/undoNotice';
import { TaskCard } from './TaskCard';
import { TaskEditModal } from './TaskEditModal';

interface TaskQueuePanelProps {
	app: App;
	taskStore: TaskStore;
	queueStore: QueueOrderStore;
}

export function TaskQueuePanel({ app, taskStore, queueStore }: TaskQueuePanelProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);

	const sensors = useSensors(useSensor(PointerSensor));

	useEffect(() => {
		void taskStore.getQueue().then(queue => {
			setTasks(queue);
			setLoading(false);
		});
	}, []);

	function refreshQueue() {
		void taskStore.getQueue().then(setTasks);
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = tasks.findIndex(t => t.id === String(active.id));
		const newIndex = tasks.findIndex(t => t.id === String(over.id));
		if (oldIndex === -1 || newIndex === -1) return;
		setTasks(prev => arrayMove(prev, oldIndex, newIndex));
		void queueStore.move(oldIndex, newIndex);
	}

	function openAddModal() {
		new TaskEditModal(app, null, async (t) => {
			const created = await taskStore.createAndAppendTask(t.title);
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
		await queueStore.markDone(task.id);
		setTasks(prev => prev.filter(t => t.id !== task.id));
		showUndoNotice(`"${task.title}" marked as done.`, async () => {
			await taskStore.updateTask({ ...task, completed: false });
			await queueStore.markUndone(task.id);
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
			await queueStore.insertAt(restored.id, originalIndex);
			refreshQueue();
		});
	}

	if (loading) {
		return <div className="mg-queue-loading">Loading…</div>;
	}

	return (
		<div className="mg-task-queue">
			<div className="mg-task-queue__header">
				<h4>Task Queue</h4>
				<button onClick={openAddModal} className="mod-cta">+ Add Task</button>
			</div>
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
	);
}
