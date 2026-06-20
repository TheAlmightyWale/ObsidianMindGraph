import { type Task, type DependentMap } from '../../types';

/**
 * Builds the reverse dependency map from a flat task list.
 * Result: taskId → array of IDs of tasks that depend on it.
 */
export function buildDependentMap(tasks: Task[]): DependentMap {
	const map: DependentMap = new Map();
	for (const task of tasks) {
		if (!map.has(task.id)) map.set(task.id, []);
		for (const depId of task.dependencies) {
			if (!map.has(depId)) map.set(depId, []);
			map.get(depId)!.push(task.id);
		}
	}
	return map;
}

/**
 * Returns true if adding the edge "fromId → toId"
 * (meaning toId depends on fromId) would create a cycle.
 *
 * Algorithm: BFS forward from toId through the existing dependent map.
 * If fromId is reachable, adding the edge would complete a cycle.
 */
export function wouldCreateCycle(
	tasks: Task[],
	fromId: string,
	toId: string,
): boolean {
	const dependentMap = buildDependentMap(tasks);
	const visited = new Set<string>();
	const queue = [toId];
	while (queue.length > 0) {
		const curr = queue.shift()!;
		if (curr === fromId) return true;
		if (visited.has(curr)) continue;
		visited.add(curr);
		for (const id of dependentMap.get(curr) ?? []) {
			queue.push(id);
		}
	}
	return false;
}

/**
 * Returns tasks in a valid execution order (all prerequisites before dependants).
 * Assumes no cycles — call wouldCreateCycle first.
 * Uses Kahn's algorithm; tasks with equal depth preserve their original relative order.
 */
export function topologicalSort(tasks: Task[]): Task[] {
	const taskIds = new Set(tasks.map(t => t.id));
	const inDegree = new Map<string, number>();
	const adjList = new Map<string, string[]>();

	for (const task of tasks) {
		const prereqs = task.dependencies.filter(id => taskIds.has(id));
		inDegree.set(task.id, prereqs.length);
		if (!adjList.has(task.id)) adjList.set(task.id, []);
		for (const depId of prereqs) {
			if (!adjList.has(depId)) adjList.set(depId, []);
			adjList.get(depId)!.push(task.id);
		}
	}

	const ready: string[] = tasks
		.filter(t => (inDegree.get(t.id) ?? 0) === 0)
		.map(t => t.id);

	const taskMap = new Map(tasks.map(t => [t.id, t]));
	const result: Task[] = [];

	while (ready.length > 0) {
		const curr = ready.shift()!;
		const task = taskMap.get(curr);
		if (task) result.push(task);
		for (const dependent of adjList.get(curr) ?? []) {
			const newDeg = (inDegree.get(dependent) ?? 0) - 1;
			inDegree.set(dependent, newDeg);
			if (newDeg === 0) ready.push(dependent);
		}
	}

	return result;
}

/**
 * Returns a new queue (ordered Task[]) that satisfies all dependency constraints
 * while making the fewest positional changes to the current order.
 *
 * Algorithm: walk the current queue front-to-back. Take the first task whose
 * in-queue prerequisites are all already placed; if none is ready, force-place
 * the front task to avoid an infinite loop on unexpected cycles.
 */
export function reorderToSatisfyDependencies(queue: Task[]): Task[] {
	const queuedIds = new Set(queue.map(t => t.id));
	const placed = new Set<string>();
	const result: Task[] = [];
	const remaining = [...queue];

	while (remaining.length > 0) {
		let placedOne = false;
		for (let i = 0; i < remaining.length; i++) {
			const task = remaining[i];
			if (!task) continue;
			const prereqsInQueue = task.dependencies.filter(id => queuedIds.has(id));
			if (prereqsInQueue.every(id => placed.has(id))) {
				result.push(task);
				placed.add(task.id);
				remaining.splice(i, 1);
				placedOne = true;
				break;
			}
		}
		if (!placedOne) {
			// Shouldn't happen without cycles — force-place to avoid infinite loop
			const task = remaining.shift()!;
			result.push(task);
			placed.add(task.id);
		}
	}

	return result;
}
