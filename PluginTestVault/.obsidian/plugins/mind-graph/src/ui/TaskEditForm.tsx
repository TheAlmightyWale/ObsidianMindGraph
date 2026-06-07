import React, { useState } from 'react';
import { Task } from '../types';

interface TaskEditFormProps {
	task: Task | null;
	onSave: (task: Task) => Promise<void>;
	onCancel: () => void;
}

export function TaskEditForm({ task, onSave, onCancel }: TaskEditFormProps) {
	const [title, setTitle] = useState(task?.title ?? '');
	const [description, setDescription] = useState(task?.description ?? '');
	const [completionCriteria, setCompletionCriteria] = useState(task?.completionCriteria ?? '');
	const [saving, setSaving] = useState(false);

	function handleSave() {
		if (!title.trim() || saving) return;
		setSaving(true);
		void onSave({
			id: task?.id ?? '',
			filePath: task?.filePath ?? '',
			title: title.trim(),
			description,
			completionCriteria,
			completed: task?.completed ?? false,
			automatable: task?.automatable ?? false,
			contextType: task?.contextType ?? null,
			dependencies: task?.dependencies ?? [],
			project: task?.project ?? null,
		}).finally(() => setSaving(false));
	}

	return (
		<div className="mg-task-edit-form">
			<div className="mg-field">
				<label>Title</label>
				<input
					type="text"
					value={title}
					onChange={e => setTitle(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') handleSave();
						if (e.key === 'Escape') onCancel();
					}}
					autoFocus
				/>
			</div>
			<div className="mg-field">
				<label>Description</label>
				<textarea
					value={description}
					onChange={e => setDescription(e.target.value)}
					rows={4}
				/>
			</div>
			<div className="mg-field">
				<label>Completion Criteria</label>
				<textarea
					value={completionCriteria}
					onChange={e => setCompletionCriteria(e.target.value)}
					rows={3}
				/>
			</div>
			<div className="mg-field--disabled">
				<label>
					<input type="checkbox" disabled />
					{' '}Can be automated (coming in a future phase)
				</label>
			</div>
			<div className="mg-form-actions">
				<button onClick={onCancel}>Cancel</button>
				<button
					onClick={handleSave}
					disabled={!title.trim() || saving}
					className="mod-cta"
				>
					{saving ? 'Saving…' : 'Save Task'}
				</button>
			</div>
		</div>
	);
}
