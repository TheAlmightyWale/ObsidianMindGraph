import { App, TFile, TFolder } from 'obsidian';
import { Task } from '../types';
import { PROJECTS_FOLDER, tasksFolder } from './constants';
import { generateId } from './ids';
import { deserializeTask, serializeTask } from './taskSerializer';
import { QueueFileStore } from './queueFileStore';

export class TaskStore {
	constructor(
		private app: App,
		private queueFileStore: QueueFileStore,
	) {}

	async createTask(
		title: string,
		projectSlug: string,
		destination: 'queue' | 'backlog',
	): Promise<Task> {
		const id = generateId();
		const filePath = `${tasksFolder(projectSlug)}/${id}.md`;
		const task: Task = {
			id,
			filePath,
			title,
			description: '',
			completionCriteria: '',
			completed: false,
			automatable: false,
			contextType: null,
			dependencies: [],
			project: projectSlug,
		};
		await this.app.vault.create(filePath, serializeTask(task));
		if (destination === 'queue') {
			await this.queueFileStore.appendToQueue(projectSlug, filePath);
		} else {
			await this.queueFileStore.addToBacklog(projectSlug, filePath);
		}
		return task;
	}

	// Creates the vault file only — does NOT modify queue or backlog.
	// Used for undo-delete: caller is responsible for re-inserting into the queue.
	async createTaskFile(template: Task): Promise<Task> {
		const id = generateId();
		const filePath = `${tasksFolder(template.project)}/${id}.md`;
		const task: Task = { ...template, id, filePath };
		await this.app.vault.create(filePath, serializeTask(task));
		return task;
	}

	async readTask(filePath: string): Promise<Task> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) throw new Error(`Task file not found: ${filePath}`);
		const content = await this.app.vault.read(file);
		return deserializeTask(content, filePath);
	}

	async updateTask(task: Task): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) throw new Error(`Task file not found: ${task.filePath}`);
		await this.app.vault.modify(file, serializeTask(task));
	}

	async deleteTask(task: Task): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) throw new Error(`Task file not found: ${task.filePath}`);
		await this.app.fileManager.trashFile(file);
		// Remove from whichever list the task was in — safe to call both
		await this.queueFileStore.removeFromQueue(task.project, task.filePath);
		await this.queueFileStore.removeFromBacklog(task.project, task.filePath);
	}

	async listAllTasks(projectSlug?: string): Promise<Task[]> {
		if (projectSlug) {
			return this.listTasksInFolder(tasksFolder(projectSlug));
		}
		const root = this.app.vault.getAbstractFileByPath(PROJECTS_FOLDER);
		if (!(root instanceof TFolder)) return [];
		const tasks: Task[] = [];
		for (const child of root.children) {
			if (child instanceof TFolder) {
				tasks.push(...await this.listTasksInFolder(tasksFolder(child.name)));
			}
		}
		return tasks;
	}

	async getQueue(projectSlug: string): Promise<Task[]> {
		const order = await this.queueFileStore.getQueueOrder(projectSlug);
		const tasks: Task[] = [];
		for (const filePath of order) {
			try {
				const task = await this.readTask(filePath);
				if (!task.completed) tasks.push(task);
			} catch {
				// file removed externally — skip stale entry
			}
		}
		return tasks;
	}

	async getBacklog(projectSlug: string): Promise<Task[]> {
		const paths = await this.queueFileStore.getBacklog(projectSlug);
		const tasks: Task[] = [];
		for (const filePath of paths) {
			try {
				tasks.push(await this.readTask(filePath));
			} catch {
				// file removed externally — skip stale entry
			}
		}
		return tasks;
	}

	private async listTasksInFolder(folderPath: string): Promise<Task[]> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return [];
		const tasks: Task[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				const content = await this.app.vault.read(child);
				tasks.push(deserializeTask(content, child.path));
			}
		}
		return tasks;
	}
}
