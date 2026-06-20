export interface Task {
	id: string; // UUID — never changes even if the file is renamed
	filePath: string;
	title: string;
	description: string;
	completionCriteria: string;
	completed: boolean;
	automatable: boolean;
	contextType: string | null;
	dependencies: string[];
	project: string;
}

export interface Project {
	id: string;       // slug, matches folder name — never changes
	name: string;     // display name, user-editable
	description: string;
	createdAt: string; // ISO 8601
}

export interface MindGraphData {
	// queue ordering lives in per-project queue.md files, not here
}

/** Reverse dependency map: taskId → IDs of tasks that depend on it */
export type DependentMap = Map<string, string[]>;
