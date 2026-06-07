import React, { useState } from 'react';
import { Project } from '../types';

interface ProjectEditFormProps {
	project: Project | null;
	onSave: (project: Project) => Promise<void>;
	onCancel: () => void;
}

export function ProjectEditForm({ project, onSave, onCancel }: ProjectEditFormProps) {
	const [name, setName] = useState(project?.name ?? '');
	const [description, setDescription] = useState(project?.description ?? '');
	const [saving, setSaving] = useState(false);

	function handleSave() {
		if (!name.trim() || saving) return;
		setSaving(true);
		void onSave({
			id: project?.id ?? '',
			name: name.trim(),
			description,
			createdAt: project?.createdAt ?? new Date().toISOString(),
		}).finally(() => setSaving(false));
	}

	return (
		<div className="mg-task-edit-form">
			<div className="mg-field">
				<label>Name</label>
				<input
					type="text"
					value={name}
					onChange={e => setName(e.target.value)}
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
			<div className="mg-form-actions">
				<button onClick={onCancel}>Cancel</button>
				<button
					onClick={handleSave}
					disabled={!name.trim() || saving}
					className="mod-cta"
				>
					{saving ? 'Saving…' : project ? 'Save Project' : 'Create Project'}
				</button>
			</div>
		</div>
	);
}
