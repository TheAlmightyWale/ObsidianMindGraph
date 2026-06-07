import { App, Modal } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Task } from '../types';
import { TaskEditForm } from './TaskEditForm';

export class TaskEditModal extends Modal {
	private root: Root | null = null;

	constructor(
		app: App,
		private task: Task | null,
		private onSave: (task: Task) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.task ? 'Edit Task' : 'New Task');
		this.root = createRoot(this.contentEl);
		this.root.render(
			<TaskEditForm
				task={this.task}
				onSave={async (t) => {
					await this.onSave(t);
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
