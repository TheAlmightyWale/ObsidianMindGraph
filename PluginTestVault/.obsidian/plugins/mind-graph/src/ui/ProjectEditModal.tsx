import { App, Modal } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Project } from '../types';
import { ProjectEditForm } from './ProjectEditForm';

export class ProjectEditModal extends Modal {
	private root: Root | null = null;

	constructor(
		app: App,
		private project: Project | null,
		private onSave: (project: Project) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.project ? 'Edit Project' : 'New Project');
		this.root = createRoot(this.contentEl);
		this.root.render(
			<ProjectEditForm
				project={this.project}
				onSave={async (p) => {
					await this.onSave(p);
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
