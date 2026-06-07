import { parseYaml, stringifyYaml } from 'obsidian';
import { Task } from '../types';

export function serializeTask(task: Task): string {
	const fm = stringifyYaml({
		id: task.id,
		completed: task.completed,
		completionCriteria: task.completionCriteria,
		automatable: task.automatable,
		contextType: task.contextType,
		dependencies: task.dependencies,
		project: task.project,
	});
	const body = task.description.trim()
		? `# ${task.title}\n\n${task.description.trim()}`
		: `# ${task.title}`;
	return `---\n${fm}---\n\n${body}`;
}

export function deserializeTask(content: string, filePath: string): Task {
	const fmEnd = content.indexOf('\n---\n', 4);
	if (!content.startsWith('---\n') || fmEnd === -1) {
		throw new Error(`Invalid task file: ${filePath}`);
	}

	const yamlStr = content.slice(4, fmEnd);
	const body = content.slice(fmEnd + 5).trim();
	const fm = parseYaml(yamlStr) as Record<string, unknown>;

	const titleMatch = body.match(/^#\s+(.+)$/m);
	const title = titleMatch?.[1]?.trim() ?? '';
	const description = body.replace(/^#[^\n]*\n?/, '').trim();

	return {
		id: typeof fm['id'] === 'string' ? fm['id'] : '',
		filePath,
		title,
		description,
		completionCriteria: typeof fm['completionCriteria'] === 'string' ? fm['completionCriteria'] : '',
		completed: Boolean(fm['completed']),
		automatable: Boolean(fm['automatable']),
		contextType: typeof fm['contextType'] === 'string' ? fm['contextType'] : null,
		dependencies: Array.isArray(fm['dependencies']) ? (fm['dependencies'] as string[]) : [],
		project: typeof fm['project'] === 'string' ? fm['project'] : null,
	};
}
