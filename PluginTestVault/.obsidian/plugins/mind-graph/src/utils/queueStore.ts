import { MindGraphData } from '../types';

export class QueueOrderStore {
	private data: MindGraphData = { queue: { queueOrder: [], doneTaskIds: [] } };

	constructor(
		private loadFn: () => Promise<unknown>,
		private saveFn: (data: MindGraphData) => Promise<void>,
	) {}

	async load(): Promise<void> {
		const saved = (await this.loadFn()) as Partial<MindGraphData> | null;
		this.data = {
			queue: {
				queueOrder: saved?.queue?.queueOrder ?? [],
				doneTaskIds: saved?.queue?.doneTaskIds ?? [],
			},
		};
	}

	getOrder(): string[] {
		return this.data.queue.queueOrder;
	}

	getDoneIds(): string[] {
		return this.data.queue.doneTaskIds;
	}

	async setOrder(ids: string[]): Promise<void> {
		this.data.queue.queueOrder = ids;
		await this.saveFn(this.data);
	}

	async append(taskId: string): Promise<void> {
		this.data.queue.queueOrder.push(taskId);
		await this.saveFn(this.data);
	}

	async remove(taskId: string): Promise<void> {
		this.data.queue.queueOrder = this.data.queue.queueOrder.filter(id => id !== taskId);
		this.data.queue.doneTaskIds = this.data.queue.doneTaskIds.filter(id => id !== taskId);
		await this.saveFn(this.data);
	}

	async markDone(taskId: string): Promise<void> {
		this.data.queue.queueOrder = this.data.queue.queueOrder.filter(id => id !== taskId);
		if (!this.data.queue.doneTaskIds.includes(taskId)) {
			this.data.queue.doneTaskIds.push(taskId);
		}
		await this.saveFn(this.data);
	}

	async markUndone(taskId: string): Promise<void> {
		this.data.queue.doneTaskIds = this.data.queue.doneTaskIds.filter(id => id !== taskId);
		if (!this.data.queue.queueOrder.includes(taskId)) {
			this.data.queue.queueOrder.push(taskId);
		}
		await this.saveFn(this.data);
	}

	async insertAt(taskId: string, index: number): Promise<void> {
		const order = [...this.data.queue.queueOrder];
		order.splice(Math.min(index, order.length), 0, taskId);
		this.data.queue.queueOrder = order;
		await this.saveFn(this.data);
	}

	async move(fromIndex: number, toIndex: number): Promise<void> {
		const order = [...this.data.queue.queueOrder];
		const removed = order.splice(fromIndex, 1);
		const moved = removed[0];
		if (moved !== undefined) {
			order.splice(toIndex, 0, moved);
		}
		this.data.queue.queueOrder = order;
		await this.saveFn(this.data);
	}
}
