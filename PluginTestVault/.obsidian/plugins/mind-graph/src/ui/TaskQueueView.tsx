import React from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import MindGraphPlugin from '../main';
import { TaskQueuePanel } from './TaskQueuePanel';

export const VIEW_TYPE_TASK_QUEUE = 'mind-graph-task-queue';

export class TaskQueueView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MindGraphPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TASK_QUEUE;
	}

	getDisplayText(): string {
		return 'Task queue';
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.containerEl.children[1] as HTMLElement);
		this.root.render(
			<TaskQueuePanel
				app={this.plugin.app}
				taskStore={this.plugin.taskStore}
				queueStore={this.plugin.queueStore}
			/>
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
