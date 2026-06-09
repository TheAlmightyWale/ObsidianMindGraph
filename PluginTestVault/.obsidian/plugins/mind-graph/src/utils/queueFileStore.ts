import { App, TFile } from 'obsidian';
import { stringifyYaml } from 'obsidian';
import { backlogFilePath, queueFilePath } from './constants';

const LINK_REGEX = /^- \[\[(.+?)\]\]/;

type ChangeListener = () => void;

export class QueueFileStore {
	constructor(private app: App) { }

	private queueListeners = new Map<string, Set<ChangeListener>>();
	private backlogListeners = new Map<string, Set<ChangeListener>>();

	subscribeQueue(slug: string, cb: ChangeListener): () => void {
		if (!this.queueListeners.has(slug)) this.queueListeners.set(slug, new Set());
		this.queueListeners.get(slug)!.add(cb);
		return () => this.queueListeners.get(slug)?.delete(cb);
	}

	subscribeBacklog(slug: string, cb: ChangeListener): () => void {
		if (!this.backlogListeners.has(slug)) this.backlogListeners.set(slug, new Set());
		this.backlogListeners.get(slug)!.add(cb);
		return () => this.backlogListeners.get(slug)?.delete(cb);
	}

	private notifyQueue(slug: string) {
		this.queueListeners.get(slug)?.forEach(cb => cb());
	}

	private notifyBacklog(slug: string) {
		this.backlogListeners.get(slug)?.forEach(cb => cb());
	}

	async getQueueOrder(projectSlug: string): Promise<string[]> {
		console.log(`Getting queue order for project ${projectSlug}`);
		return this.readLinks(queueFilePath(projectSlug));
	}

	async setQueueOrder(projectSlug: string, filePaths: string[]): Promise<void> {
		console.log(`Setting queue order for project ${projectSlug}`);
		await this.writeLinks(queueFilePath(projectSlug), projectSlug, 'queue', filePaths);
		this.notifyQueue(projectSlug);
	}

	async appendToQueue(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Appending ${filePath} to queue for project ${projectSlug}`);
		const order = await this.getQueueOrder(projectSlug);
		await this.setQueueOrder(projectSlug, [...order, filePath]);
	}

	async removeFromQueue(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Removing ${filePath} from queue for project ${projectSlug}`);
		const order = await this.getQueueOrder(projectSlug);
		await this.setQueueOrder(projectSlug, order.filter(p => p !== filePath));
	}

	async moveInQueue(projectSlug: string, fromIndex: number, toIndex: number): Promise<void> {
		const order = [...await this.getQueueOrder(projectSlug)];
		const [moved] = order.splice(fromIndex, 1);
		if (moved !== undefined) order.splice(toIndex, 0, moved);
		await this.setQueueOrder(projectSlug, order);
	}

	async insertInQueue(projectSlug: string, filePath: string, index: number): Promise<void> {
		const order = await this.getQueueOrder(projectSlug);
		const updated = [...order];
		updated.splice(Math.min(index, updated.length), 0, filePath);
		await this.setQueueOrder(projectSlug, updated);
	}

	async getBacklog(projectSlug: string): Promise<string[]> {
		console.log(`Getting backlog for project ${projectSlug}`);
		return this.readLinks(backlogFilePath(projectSlug));
	}

	async addToBacklog(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Adding ${filePath} to backlog for project ${projectSlug}`);
		const backlog = await this.getBacklog(projectSlug);
		if (backlog.includes(filePath)) return;
		await this.writeLinks(backlogFilePath(projectSlug), projectSlug, 'backlog', [...backlog, filePath]);
		this.notifyBacklog(projectSlug);
	}

	async removeFromBacklog(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Removing ${filePath} from backlog for project ${projectSlug}`);
		const backlog = await this.getBacklog(projectSlug);
		await this.writeLinks(backlogFilePath(projectSlug), projectSlug, 'backlog', backlog.filter(p => p !== filePath));
		this.notifyBacklog(projectSlug);
	}

	async promoteToQueue(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Promoting ${filePath} to queue for project ${projectSlug}`);
		await this.removeFromBacklog(projectSlug, filePath);
		await this.appendToQueue(projectSlug, filePath);
	}

	async demoteToBacklog(projectSlug: string, filePath: string): Promise<void> {
		console.log(`Demoting ${filePath} to backlog for project ${projectSlug}`);
		await this.removeFromQueue(projectSlug, filePath);
		await this.addToBacklog(projectSlug, filePath);
	}

	private async readLinks(filePath: string): Promise<string[]> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return [];
		const content = await this.app.vault.read(file);
		const links = content
			.split('\n')
			.map(line => LINK_REGEX.exec(line)?.[1])
			.filter((p): p is string => p !== undefined);
		console.log(`Read links from ${filePath}:`, links);
		return links;
	}

	private async writeLinks(
		filePath: string,
		projectSlug: string,
		type: 'queue' | 'backlog',
		paths: string[],
	): Promise<void> {
		console.log(`Writing links to ${filePath}:`, paths);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) throw new Error(`Queue file not found: ${filePath}`);
		const fm = stringifyYaml({ project: projectSlug, type });
		const body = paths.map(p => `- [[${p}]]`).join('\n');
		const content = `---\n${fm}---\n${body ? '\n' + body + '\n' : ''}`;
		await this.app.vault.modify(file, content);
		console.log(`Finished writing links to ${filePath}. Reading:`);
		await this.readLinks(filePath); // sanity check to ensure file was written correctly
	}
}
