import React from 'react';
import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import MindGraphPlugin from '../main';
import { ProjectQueuePanel } from './ProjectQueuePanel';

export const VIEW_TYPE_PROJECT_QUEUE = 'mind-graph-project-queue';

export class ProjectQueueView extends ItemView {
	private root: Root | null = null;
	projectSlug = '';

	constructor(leaf: WorkspaceLeaf, private plugin: MindGraphPlugin) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_PROJECT_QUEUE; }
	getDisplayText(): string { return this.projectSlug ? `Queue: ${this.projectSlug}` : 'Project Queue'; }
	getIcon(): string { return 'list-checks'; }

	async onOpen(): Promise<void> {
		this.root = createRoot(this.containerEl.children[1] as HTMLElement);
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const slug = typeof state['slug'] === 'string' ? state['slug'] : '';
		this.projectSlug = slug;
		this.root?.render(
			<ProjectQueuePanel
				app={this.plugin.app}
				projectStore={this.plugin.projectStore}
				taskStore={this.plugin.taskStore}
				queueFileStore={this.plugin.queueFileStore}
				projectSlug={slug}
				onProjectDeleted={() => this.leaf.detach()}
			/>
		);
	}

	getState(): Record<string, unknown> {
		return { slug: this.projectSlug };
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
