import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MindGraphSettings,
	MindGraphSettingTab,
} from './settings';
import { ProjectStore } from './utils/projectStore';
import { QueueFileStore } from './utils/queueFileStore';
import { TaskStore } from './utils/taskStore';
import { ProjectsOverviewView, VIEW_TYPE_PROJECTS_OVERVIEW } from './ui/ProjectsOverviewView';
import { ProjectQueueView, VIEW_TYPE_PROJECT_QUEUE } from './ui/ProjectQueueView';

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
			VIEW_TYPE_PROJECTS_OVERVIEW,
			(leaf) => new ProjectsOverviewView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_PROJECT_QUEUE,
			(leaf) => new ProjectQueueView(leaf, this),
		);

		this.addCommand({
			id: 'open-projects-overview',
			name: 'Open projects overview',
			callback: () => { void this.activateProjectsOverview(); },
		});

		this.addRibbonIcon('layout-grid', 'Projects overview', () => {
			void this.activateProjectsOverview();
		});

		this.addSettingTab(new MindGraphSettingTab(this.app, this));
	}

	onunload() { }

	async activateProjectsOverview(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_PROJECTS_OVERVIEW)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_PROJECTS_OVERVIEW, active: true });
		await workspace.revealLeaf(leaf);
	}

	async activateProjectQueue(slug: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_PROJECT_QUEUE)
			.find(l => (l.view as ProjectQueueView).projectSlug === slug);
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_PROJECT_QUEUE, active: true, state: { slug } });
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
