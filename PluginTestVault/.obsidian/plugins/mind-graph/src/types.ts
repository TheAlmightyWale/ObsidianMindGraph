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
	project: string | null;
}

export interface QueueStore {
	queueOrder: string[];
	doneTaskIds: string[];
}

export interface MindGraphData {
	queue: QueueStore;
}
