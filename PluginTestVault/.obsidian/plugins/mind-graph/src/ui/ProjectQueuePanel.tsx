import React, { useEffect, useState } from 'react';
import { App, Notice } from 'obsidian';
import { Project, Task } from '../types';
import { ProjectStore } from '../utils/projectStore';
import { QueueFileStore } from '../utils/queueFileStore';
import { TaskStore } from '../utils/taskStore';
import { showUndoNotice } from '../utils/undoNotice';
import { BacklogSection } from './BacklogSection';
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
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		void Promise.all([
			projectStore.readProject(projectSlug),
			taskStore.getBacklog(projectSlug),
		]).then(([p, backlog]) => {
			setProject(p);
			setBacklogTasks(backlog);
			setLoading(false);
		});
		return queueFileStore.subscribeBacklog(projectSlug, () => {
			void taskStore.getBacklog(projectSlug).then(setBacklogTasks);
		});
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
		// queue subscription fires via promoteToQueue → appendToQueue → notifyQueue
	}

	function openEditTaskModal(task: Task) {
		console.log('ProjectQueuePanel: Opening edit modal for task', task);
		new TaskEditModal(app, task, async (updated) => {
			await taskStore.updateTask(updated);
			// updateTask writes the task file, not the backlog file, so subscription won't fire —
			// update local state directly instead
			setBacklogTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
		}).open();
	}

	async function handleDeleteBacklogTask(task: Task) {
		const snapshot = { ...task };
		await taskStore.deleteTask(task);
		setBacklogTasks(prev => prev.filter(t => t.id !== task.id));
		showUndoNotice(`"${snapshot.title}" deleted.`, async () => {
			const restored = await taskStore.createTaskFile(snapshot);
			await queueFileStore.addToBacklog(projectSlug, restored.filePath);
			// subscription fires via addToBacklog → notifyBacklog
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
					<button onClick={openEditProjectModal} title="Edit project">✎</button>
					<button onClick={() => { void handleDeleteProject(); }} title="Delete project">✕</button>
				</div>
			</div>
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
		</div>
	);
}
