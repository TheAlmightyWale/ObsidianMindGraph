import { App, TFile } from 'obsidian';
import { stringifyYaml } from 'obsidian';
import { backlogFilePath, queueFilePath } from './constants';

const LINK_REGEX = /^- \[\[(.+?)\]\]/;

export class QueueFileStore {
	constructor(private app: App) {}

	async getQueueOrder(projectSlug: string): Promise<string[]> {
		return this.readLinks(queueFilePath(projectSlug));
	}

	async setQueueOrder(projectSlug: string, filePaths: string[]): Promise<void> {
		await this.writeLinks(queueFilePath(projectSlug), projectSlug, 'queue', filePaths);
	}

	async appendToQueue(projectSlug: string, filePath: string): Promise<void> {
		const order = await this.getQueueOrder(projectSlug);
		await this.setQueueOrder(projectSlug, [...order, filePath]);
	}

	async removeFromQueue(projectSlug: string, filePath: string): Promise<void> {
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
		return this.readLinks(backlogFilePath(projectSlug));
	}

	async addToBacklog(projectSlug: string, filePath: string): Promise<void> {
		const backlog = await this.getBacklog(projectSlug);
		if (backlog.includes(filePath)) return;
		await this.writeLinks(backlogFilePath(projectSlug), projectSlug, 'backlog', [...backlog, filePath]);
	}

	async removeFromBacklog(projectSlug: string, filePath: string): Promise<void> {
		const backlog = await this.getBacklog(projectSlug);
		await this.writeLinks(backlogFilePath(projectSlug), projectSlug, 'backlog', backlog.filter(p => p !== filePath));
	}

	async promoteToQueue(projectSlug: string, filePath: string): Promise<void> {
		await this.removeFromBacklog(projectSlug, filePath);
		await this.appendToQueue(projectSlug, filePath);
	}

	private async readLinks(filePath: string): Promise<string[]> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return [];
		const content = await this.app.vault.read(file);
		return content
			.split('\n')
			.map(line => LINK_REGEX.exec(line)?.[1])
			.filter((p): p is string => p !== undefined);
	}

	private async writeLinks(
		filePath: string,
		projectSlug: string,
		type: 'queue' | 'backlog',
		paths: string[],
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) throw new Error(`Queue file not found: ${filePath}`);
		const fm = stringifyYaml({ project: projectSlug, type });
		const body = paths.map(p => `- [[${p}]]`).join('\n');
		const content = `---\n${fm}---\n${body ? '\n' + body + '\n' : ''}`;
		await this.app.vault.modify(file, content);
	}
}
