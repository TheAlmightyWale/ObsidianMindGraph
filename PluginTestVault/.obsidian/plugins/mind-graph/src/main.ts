import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MindGraphSettings,
	MindGraphSettingTab,
} from './settings';
import { ProjectStore } from './utils/projectStore';
import { QueueFileStore } from './utils/queueFileStore';
import { TaskStore } from './utils/taskStore';
import { TaskQueueView, VIEW_TYPE_TASK_QUEUE } from './ui/TaskQueueView';

export default class MindGraphPlugin extends Plugin {
	settings!: MindGraphSettings;
	projectStore!: ProjectStore;
	queueFileStore!: QueueFileStore;
	taskStore!: TaskStore;

	async onload() {
		await this.loadSettings();

		this.projectStore = new ProjectStore(this.app);
		this.queueFileStore = new QueueFileStore(this.app);
		this.taskStore = new TaskStore(this.app, this.queueFileStore);

		this.app.workspace.onLayoutReady(() => {
			void this.projectStore.ensureDefaults();
		});

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

	// Fully implemented in Step 7 once ProjectQueueView exists
	async activateProjectQueue(_slug: string): Promise<void> {}

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
