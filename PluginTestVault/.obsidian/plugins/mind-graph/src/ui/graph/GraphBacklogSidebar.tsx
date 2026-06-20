import React, { useEffect, useRef, useState } from 'react';
import {
	DndContext,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import { type Task } from '../../types';
import { truncateDescription } from '../../utils/descriptionPreview';

interface GraphBacklogSidebarProps {
	tasks: Task[];
	onDrop: (taskId: string, pointerX: number) => void;
	onDragMove?: (pointerX: number) => void;
	onDragEnd?: () => void;
	onEdit: (task: Task) => void;
}

interface BacklogItemProps {
	task: Task;
	onEdit: (task: Task) => void;
}

function BacklogItem({ task, onEdit }: BacklogItemProps) {
	const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
		id: task.id,
	});

	const style: React.CSSProperties = {
		position: 'relative',
		...(transform ? {
			transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
			zIndex: 9999,
		} : {}),
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`mg-graph-backlog__item${isDragging ? ' mg-graph-backlog__item--dragging' : ''}`}
			{...attributes}
			{...listeners}
		>
			<span className="mg-backlog-pill">{task.title}</span>
			{task.description && (
				<span className="mg-graph-backlog__item-desc">{truncateDescription(task.description)}</span>
			)}
			<div className="mg-graph-backlog__item-footer">
				<button
					className="mg-graph-backlog__edit"
					onPointerDown={e => e.stopPropagation()}
					onClick={e => { e.stopPropagation(); onEdit(task); }}
					aria-label="Edit task"
				>
					✎
				</button>
			</div>
		</div>
	);
}

export function GraphBacklogSidebar({ tasks, onDrop, onDragMove, onDragEnd, onEdit }: GraphBacklogSidebarProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [isDraggingAny, setIsDraggingAny] = useState(false);
	const pointerXRef = useRef(0);

	const sensors = useSensors(useSensor(PointerSensor));

	// Track pointer globally while dragging so we get updates even over the canvas
	useEffect(() => {
		if (!isDraggingAny) return;
		const handleMove = (e: PointerEvent) => {
			pointerXRef.current = e.clientX;
			onDragMove?.(e.clientX);
		};
		window.addEventListener('pointermove', handleMove);
		return () => window.removeEventListener('pointermove', handleMove);
	}, [isDraggingAny, onDragMove]);

	function handleDragEnd(event: DragEndEvent) {
		setIsDraggingAny(false);
		if (event.active) {
			onDrop(event.active.id as string, pointerXRef.current);
		}
		onDragEnd?.();
	}

	return (
		<DndContext
			sensors={sensors}
			onDragStart={() => setIsDraggingAny(true)}
			onDragEnd={handleDragEnd}
		>
			<div
				className={`mg-graph-backlog${collapsed ? ' mg-graph-backlog--collapsed' : ''}`}
				style={isDraggingAny ? { overflow: 'visible' } : undefined}
				onPointerMove={e => { pointerXRef.current = e.clientX; }}
			>
				<button
					className="mg-graph-backlog__toggle"
					onClick={() => setCollapsed(c => !c)}
					aria-label={collapsed ? 'Expand backlog' : 'Collapse backlog'}
				>
					{collapsed ? '›' : '‹'}
				</button>

				{!collapsed && (
					<>
						<h4 className="mg-graph-backlog__title">Backlog</h4>
						{tasks.length === 0 ? (
							<p className="mg-graph-backlog__empty">No tasks.</p>
						) : (
							<div className="mg-graph-backlog__list">
								{tasks.map(task => (
									<BacklogItem key={task.id} task={task} onEdit={onEdit} />
								))}
							</div>
						)}
					</>
				)}
			</div>
		</DndContext>
	);
}
