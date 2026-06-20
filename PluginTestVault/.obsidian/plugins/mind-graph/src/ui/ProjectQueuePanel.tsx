import React, { useEffect, useState } from 'react';
import { App, Notice } from 'obsidian';
import { Project, Task } from '../types';
import { ProjectStore } from '../utils/projectStore';
import { QueueFileStore } from '../utils/queueFileStore';
import { TaskStore } from '../utils/taskStore';
import { showUndoNotice } from '../utils/undoNotice';
import { BacklogSection } from './BacklogSection';
import { DependencyGraphCanvas } from './DependencyGraphCanvas';
import { ProjectEditModal } from './ProjectEditModal';
import { TaskEditModal } from './TaskEditModal';
import { TaskQueuePanel } from './TaskQueuePanel';

interface ProjectQueuePanelProps {
	app: App;
	projectStore: ProjectStore;
	taskStore: TaskStore;
	queueFileStore: QueueFileStore;
	projectSlug: string;
	onProjectDeleted?: () => void;
}

export function ProjectQueuePanel({
	app,
	projectStore,
	taskStore,
	queueFileStore,
	projectSlug,
	onProjectDeleted,
}: ProjectQueuePanelProps) {
	const [project, setProject] = useState<Project | null>(null);
	const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
	const [queuedTasks, setQueuedTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [viewMode, setViewMode] = useState<'cards' | 'graph'>('cards');

	useEffect(() => {
		void Promise.all([
			projectStore.readProject(projectSlug),
			taskStore.getBacklog(projectSlug),
			taskStore.getQueue(projectSlug),
		]).then(([p, backlog, queue]) => {
			setProject(p);
			setBacklogTasks(backlog);
			setQueuedTasks(queue);
			setLoading(false);
		});

		const unsubQueue = queueFileStore.subscribeQueue(projectSlug, () => {
			void taskStore.getQueue(projectSlug).then(setQueuedTasks);
		});
		const unsubBacklog = queueFileStore.subscribeBacklog(projectSlug, () => {
			void taskStore.getBacklog(projectSlug).then(setBacklogTasks);
		});
		return () => {
			unsubQueue();
			unsubBacklog();
		};
	}, [projectSlug]);

	function openEditProjectModal() {
		if (!project) return;
		new ProjectEditModal(app, project, async (updated) => {
			await projectStore.updateProject(updated);
			setProject(updated);
		}).open();
	}

	async function handleDeleteProject() {
		const allTasks = await taskStore.listAllTasks(projectSlug);
		if (allTasks.length > 0) {
			new Notice('Remove all tasks before deleting a project.');
			return;
		}
		await projectStore.deleteProject(projectSlug);
		onProjectDeleted?.();
	}

	async function handlePromote(task: Task) {
		await queueFileStore.promoteToQueue(projectSlug, task.filePath);
		setBacklogTasks(prev => prev.filter(t => t.id !== task.id));
	}

	function openEditTaskModal(task: Task) {
		new TaskEditModal(app, task, async (updated) => {
			await taskStore.updateTask(updated);
			setBacklogTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
			setQueuedTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
		}).open();
	}

	async function handleDeleteBacklogTask(task: Task) {
		const snapshot = { ...task };
		await taskStore.deleteTask(task);
		setBacklogTasks(prev => prev.filter(t => t.id !== task.id));
		showUndoNotice(`"${snapshot.title}" deleted.`, async () => {
			const restored = await taskStore.createTaskFile(snapshot);
			await queueFileStore.addToBacklog(projectSlug, restored.filePath);
		});
	}

	async function handleGraphDone(task: Task) {
		await taskStore.updateTask({ ...task, completed: true });
		await queueFileStore.removeFromQueue(projectSlug, task.filePath);
		showUndoNotice(`"${task.title}" marked as done.`, async () => {
			await taskStore.updateTask({ ...task, completed: false });
			await queueFileStore.appendToQueue(projectSlug, task.filePath);
		});
	}

	async function handleGraphDelete(task: Task) {
		const snapshot = { ...task };
		await taskStore.deleteTask(task);
		showUndoNotice(`"${snapshot.title}" deleted.`, async () => {
			const restored = await taskStore.createTaskFile(snapshot);
			await queueFileStore.appendToQueue(projectSlug, restored.filePath);
		});
	}

	if (loading) {
		return <div className="mg-queue-loading">Loading…</div>;
	}

	return (
		<div className="mg-project-queue">
			<div className="mg-project-queue__header">
				<h3 className="mg-project-queue__name">{project?.name ?? projectSlug}</h3>
				<div className="mg-project-queue__actions">
					<button
						className={`mg-view-toggle${viewMode === 'cards' ? ' mod-active' : ''}`}
						onClick={() => setViewMode('cards')}
						title="Card view"
					>
						≡ Cards
					</button>
					<button
						className={`mg-view-toggle${viewMode === 'graph' ? ' mod-active' : ''}`}
						onClick={() => setViewMode('graph')}
						title="Graph view"
					>
						⬡ Graph
					</button>
					<button onClick={openEditProjectModal} title="Edit project">✎</button>
					<button onClick={() => { void handleDeleteProject(); }} title="Delete project">✕</button>
				</div>
			</div>

			{viewMode === 'graph' ? (
				<DependencyGraphCanvas
					taskStore={taskStore}
					queueFileStore={queueFileStore}
					projectSlug={projectSlug}
					queuedTasks={queuedTasks}
					backlogTasks={backlogTasks}
					onQueueChange={setQueuedTasks}
					onEdit={openEditTaskModal}
					onDone={task => { void handleGraphDone(task); }}
					onDelete={task => { void handleGraphDelete(task); }}
				/>
			) : (
				<>
					<TaskQueuePanel
						app={app}
						taskStore={taskStore}
						queueFileStore={queueFileStore}
						projectSlug={projectSlug}
						showDemoteButton={true}
					/>
					<BacklogSection
						tasks={backlogTasks}
						onPromote={task => { void handlePromote(task); }}
						onEdit={openEditTaskModal}
						onDelete={task => { void handleDeleteBacklogTask(task); }}
					/>
				</>
			)}
		</div>
	);
}
