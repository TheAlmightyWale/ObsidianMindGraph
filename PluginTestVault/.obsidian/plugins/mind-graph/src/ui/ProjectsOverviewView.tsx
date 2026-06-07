import React from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import MindGraphPlugin from '../main';
import { ProjectsOverviewPanel } from './ProjectsOverviewPanel';

export const VIEW_TYPE_PROJECTS_OVERVIEW = 'mind-graph-projects-overview';

export class ProjectsOverviewView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MindGraphPlugin) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_PROJECTS_OVERVIEW; }
	getDisplayText(): string { return 'Projects'; }
	getIcon(): string { return 'layout-grid'; }

	async onOpen(): Promise<void> {
		this.root = createRoot(this.containerEl.children[1] as HTMLElement);
		this.root.render(
			<ProjectsOverviewPanel
				app={this.plugin.app}
				projectStore={this.plugin.projectStore}
				taskStore={this.plugin.taskStore}
				queueFileStore={this.plugin.queueFileStore}
				onOpenProject={(slug) => { void this.plugin.activateProjectQueue(slug); }}
			/>
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
