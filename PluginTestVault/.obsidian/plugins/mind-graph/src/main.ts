import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MindGraphSettings,
	MindGraphSettingTab,
} from './settings';
import { MindGraphData } from './types';
import { QueueOrderStore } from './utils/queueStore';
import { TaskStore } from './utils/taskStore';
import { TaskQueueView, VIEW_TYPE_TASK_QUEUE } from './ui/TaskQueueView';

export default class MindGraphPlugin extends Plugin {
	settings!: MindGraphSettings;
	taskStore!: TaskStore;
	queueStore!: QueueOrderStore;

	async onload() {
		await this.loadSettings();

		this.queueStore = new QueueOrderStore(
			() => this.loadData(),
			async (data: MindGraphData) => {
				const raw = ((await this.loadData()) as Record<string, unknown>) ?? {};
				await this.saveData({ ...raw, queue: data.queue });
			},
		);
		await this.queueStore.load();

		this.taskStore = new TaskStore(this.app, this.queueStore);
		this.app.workspace.onLayoutReady(() => {
			void this.taskStore.ensureFolder();
		});
		//await this.taskStore.ensureFolder();

		this.registerView(
			VIEW_TYPE_TASK_QUEUE,
			(leaf) => new TaskQueueView(leaf, this),
		);

		this.addCommand({
			id: 'open-task-queue',
			name: 'Open task queue',
			callback: () => { void this.activateView(); },
		});

		this.addRibbonIcon('list-checks', 'Task queue', () => {
			void this.activateView();
		});

		this.addSettingTab(new MindGraphSettingTab(this.app, this));
	}

	onunload() { }

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_TASK_QUEUE)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_TASK_QUEUE, active: true });
		await workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MindGraphSettings>,
		);
	}

	async saveSettings() {
		const raw = ((await this.loadData()) as Record<string, unknown>) ?? {};
		await this.saveData({ ...raw, ...this.settings });
	}
}
