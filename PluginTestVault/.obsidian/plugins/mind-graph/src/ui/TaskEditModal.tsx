import { App, Modal } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Project, Task } from '../types';
import { TaskEditForm } from './TaskEditForm';

export class TaskEditModal extends Modal {
	private root: Root | null = null;

	constructor(
		app: App,
		private task: Task | null,
		private onSave: (task: Task, destination: 'queue' | 'backlog') => Promise<void>,
		private projects?: Project[],
		private defaultProjectSlug?: string,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.task ? 'Edit Task' : 'New Task');
		this.root = createRoot(this.contentEl);
		this.root.render(
			<TaskEditForm
				task={this.task}
				projects={this.projects}
				defaultProjectSlug={this.defaultProjectSlug}
				onSave={async (t, destination) => {
					await this.onSave(t, destination);
					this.close();
				}}
				onCancel={() => this.close()}
			/>
		);
	}

	onClose() {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
	}
}
