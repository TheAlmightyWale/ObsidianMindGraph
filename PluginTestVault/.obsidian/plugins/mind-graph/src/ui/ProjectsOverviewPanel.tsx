import React, { useEffect, useState } from 'react';
import { App } from 'obsidian';
import { Project } from '../types';
import { ProjectStore } from '../utils/projectStore';
import { QueueFileStore } from '../utils/queueFileStore';
import { TaskStore } from '../utils/taskStore';
import { ProjectEditModal } from './ProjectEditModal';
import { TaskQueuePanel } from './TaskQueuePanel';

interface ProjectsOverviewPanelProps {
	app: App;
	projectStore: ProjectStore;
	taskStore: TaskStore;
	queueFileStore: QueueFileStore;
	onOpenProject: (slug: string) => void;
}

export function ProjectsOverviewPanel({
	app,
	projectStore,
	taskStore,
	queueFileStore,
	onOpenProject,
}: ProjectsOverviewPanelProps) {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		void projectStore.listAllProjects().then(list => {
			setProjects(list);
			setLoading(false);
		});
	}, []);

	function refreshProjects() {
		void projectStore.listAllProjects().then(setProjects);
	}

	function openNewProjectModal() {
		new ProjectEditModal(app, null, async (p) => {
			await projectStore.createProject(p.name, p.description);
			refreshProjects();
		}).open();
	}

	if (loading) {
		return <div className="mg-queue-loading">Loading…</div>;
	}

	return (
		<div className="mg-projects-overview">
			<div className="mg-projects-overview__header">
				<h3>Projects</h3>
				<button onClick={openNewProjectModal} className="mod-cta">+ New Project</button>
			</div>
			<div className="mg-projects-overview__list">
				{projects.map(project => (
					<div key={project.id} className="mg-project-row">
						<TaskQueuePanel
							app={app}
							taskStore={taskStore}
							queueFileStore={queueFileStore}
							projectSlug={project.id}
							projectName={project.name}
							onProjectNameClick={() => onOpenProject(project.id)}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
