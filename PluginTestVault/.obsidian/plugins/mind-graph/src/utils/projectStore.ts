import { App, TFile, TFolder } from 'obsidian';
import { parseYaml, stringifyYaml } from 'obsidian';
import { Project } from '../types';
import {
	DEFAULT_PROJECT_NAME,
	DEFAULT_PROJECT_SLUG,
	MIND_GRAPH_ROOT,
	PROJECTS_FOLDER,
	backlogFilePath,
	projectFilePath,
	projectFolder,
	queueFilePath,
	tasksFolder,
} from './constants';

export class ProjectStore {
	constructor(private app: App) {}

	slugify(name: string): string {
		return name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	async ensureDefaults(): Promise<void> {
		await this.ensureFolder(MIND_GRAPH_ROOT);
		await this.ensureFolder(PROJECTS_FOLDER);
		if (!this.app.vault.getAbstractFileByPath(projectFolder(DEFAULT_PROJECT_SLUG))) {
			await this.createProject(DEFAULT_PROJECT_NAME, '', DEFAULT_PROJECT_SLUG);
		}
	}

	async createProject(name: string, description = '', slugOverride?: string): Promise<Project> {
		const id = slugOverride ?? this.slugify(name);
		const project: Project = {
			id,
			name,
			description,
			createdAt: new Date().toISOString(),
		};
		await this.ensureFolder(projectFolder(id));
		await this.ensureFolder(tasksFolder(id));
		await this.app.vault.create(projectFilePath(id), this.serializeProject(project));
		await this.app.vault.create(queueFilePath(id), this.emptyListFile(id, 'queue'));
		await this.app.vault.create(backlogFilePath(id), this.emptyListFile(id, 'backlog'));
		return project;
	}

	async readProject(slug: string): Promise<Project> {
		const file = this.app.vault.getAbstractFileByPath(projectFilePath(slug));
		if (!(file instanceof TFile)) throw new Error(`Project not found: ${slug}`);
		const content = await this.app.vault.read(file);
		return this.deserializeProject(content, slug);
	}

	async updateProject(project: Project): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(projectFilePath(project.id));
		if (!(file instanceof TFile)) throw new Error(`Project not found: ${project.id}`);
		await this.app.vault.modify(file, this.serializeProject(project));
	}

	async deleteProject(slug: string): Promise<void> {
		if (slug === DEFAULT_PROJECT_SLUG) throw new Error('Cannot delete the default project');
		const folder = this.app.vault.getAbstractFileByPath(projectFolder(slug));
		if (!(folder instanceof TFolder)) throw new Error(`Project folder not found: ${slug}`);
		await this.app.vault.delete(folder, true);
	}

	async listAllProjects(): Promise<Project[]> {
		const root = this.app.vault.getAbstractFileByPath(PROJECTS_FOLDER);
		if (!(root instanceof TFolder)) return [];
		const projects: Project[] = [];
		for (const child of root.children) {
			if (!(child instanceof TFolder)) continue;
			const metaFile = this.app.vault.getAbstractFileByPath(projectFilePath(child.name));
			if (!(metaFile instanceof TFile)) continue;
			const content = await this.app.vault.read(metaFile);
			projects.push(this.deserializeProject(content, child.name));
		}
		return projects;
	}

	private serializeProject(project: Project): string {
		const fm = stringifyYaml({
			id: project.id,
			name: project.name,
			description: project.description,
			createdAt: project.createdAt,
		});
		return `---\n${fm}---\n`;
	}

	private deserializeProject(content: string, slug: string): Project {
		const fmEnd = content.indexOf('\n---\n', 4);
		if (!content.startsWith('---\n') || fmEnd === -1) {
			throw new Error(`Invalid project file for slug: ${slug}`);
		}
		const fm = parseYaml(content.slice(4, fmEnd)) as Record<string, unknown>;
		return {
			id: typeof fm['id'] === 'string' ? fm['id'] : slug,
			name: typeof fm['name'] === 'string' ? fm['name'] : slug,
			description: typeof fm['description'] === 'string' ? fm['description'] : '',
			createdAt: typeof fm['createdAt'] === 'string' ? fm['createdAt'] : new Date().toISOString(),
		};
	}

	private emptyListFile(slug: string, type: 'queue' | 'backlog'): string {
		const fm = stringifyYaml({ project: slug, type });
		return `---\n${fm}---\n`;
	}

	private async ensureFolder(path: string): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(path)) {
			await this.app.vault.createFolder(path);
		}
	}
}
