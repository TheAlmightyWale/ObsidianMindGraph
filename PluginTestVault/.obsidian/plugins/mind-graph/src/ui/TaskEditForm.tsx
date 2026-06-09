import React, { useState } from 'react';
import { Project, Task } from '../types';

interface TaskEditFormProps {
	task: Task | null;
	projects?: Project[];          // when provided with 2+ items, shows a project selector
	defaultProjectSlug?: string;   // pre-selects a project in the dropdown
	onSave: (task: Task, destination: 'queue' | 'backlog') => Promise<void>;
	onCancel: () => void;
}

export function TaskEditForm({
	task,
	projects,
	defaultProjectSlug,
	onSave,
	onCancel,
}: TaskEditFormProps) {
	const isCreate = task === null;

	const [title, setTitle] = useState(task?.title ?? '');
	const [description, setDescription] = useState(task?.description ?? '');
	const [completionCriteria, setCompletionCriteria] = useState(task?.completionCriteria ?? '');
	const [selectedProject, setSelectedProject] = useState(
		defaultProjectSlug ?? task?.project ?? ''
	);
	const [destination, setDestination] = useState<'queue' | 'backlog'>('queue');
	const [saving, setSaving] = useState(false);

	const showProjectDropdown = isCreate && projects && projects.length > 1;

	function handleSave() {
		if (!title.trim() || saving) return;
		setSaving(true);
		void onSave(
			{
				id: task?.id ?? '',
				filePath: task?.filePath ?? '',
				title: title.trim(),
				description,
				completionCriteria,
				completed: task?.completed ?? false,
				automatable: task?.automatable ?? false,
				contextType: task?.contextType ?? null,
				dependencies: task?.dependencies ?? [],
				project: selectedProject || task?.project || '',
			},
			destination,
		).finally(() => setSaving(false));
	}

	return (
		<div className="mg-task-edit-form">
			{showProjectDropdown && (
				<div className="mg-field">
					<label>Project</label>
					<select
						value={selectedProject}
						onChange={e => setSelectedProject(e.target.value)}
					>
						{projects!.map(p => (
							<option key={p.id} value={p.id}>{p.name}</option>
						))}
					</select>
				</div>
			)}
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
			{isCreate && (
				<div className="mg-field">
					<label>Add to</label>
					<div className="mg-radio-group">
						<label>
							<input
								type="radio"
								value="queue"
								checked={destination === 'queue'}
								onChange={() => setDestination('queue')}
							/>
							{' '}Queue
						</label>
						<label>
							<input
								type="radio"
								value="backlog"
								checked={destination === 'backlog'}
								onChange={() => setDestination('backlog')}
							/>
							{' '}Backlog
						</label>
					</div>
				</div>
			)}
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
