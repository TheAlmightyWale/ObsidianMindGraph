import { App, TFile, TFolder } from 'obsidian';
import { Task } from '../types';
import { MIND_GRAPH_ROOT, TASKS_FOLDER } from './constants';
import { generateId } from './ids';
import { deserializeTask, serializeTask } from './taskSerializer';
import { QueueOrderStore } from './queueStore';

export class TaskStore {
	constructor(
		private app: App,
		private queueStore: QueueOrderStore,
	) {}

	async ensureFolder(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(MIND_GRAPH_ROOT)) {
			await this.app.vault.createFolder(MIND_GRAPH_ROOT);
		}
		if (!this.app.vault.getAbstractFileByPath(TASKS_FOLDER)) {
			await this.app.vault.createFolder(TASKS_FOLDER);
		}
	}

	// Creates vault file only — does NOT modify the queue.
	// id and filePath on the template are ignored; new ones are generated.
	async createTaskFile(template: Task): Promise<Task> {
		const id = generateId();
		const filePath = `${TASKS_FOLDER}/${id}.md`;
		const task: Task = { ...template, id, filePath };
		await this.app.vault.create(filePath, serializeTask(task));
		return task;
	}

	async createAndAppendTask(title: string): Promise<Task> {
		const task = await this.createTaskFile({
			id: '',
			filePath: '',
			title,
			description: '',
			completionCriteria: '',
			completed: false,
			automatable: false,
			contextType: null,
			dependencies: [],
			project: null,
		});
		await this.queueStore.append(task.id);
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
		await this.app.vault.delete(file);
		await this.queueStore.remove(task.id);
	}

	async listAllTasks(): Promise<Task[]> {
		const folder = this.app.vault.getAbstractFileByPath(TASKS_FOLDER);
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

	async getQueue(): Promise<Task[]> {
		const order = this.queueStore.getOrder();
		const all = await this.listAllTasks();
		const byId = new Map(all.map(t => [t.id, t]));
		return order
			.map(id => byId.get(id))
			.filter((t): t is Task => t !== undefined && !t.completed);
	}
}
