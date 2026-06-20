import React from 'react';
import { type Edge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';

type GraphEdgeData = Record<string, unknown> & {
	sourceId: string;
	targetId: string;
	onRemove: (sourceId: string, targetId: string) => void;
};

export type GraphEdgeType = Edge<GraphEdgeData>;

export function GraphEdge({
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
}: EdgeProps<GraphEdgeType>) {
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return (
		<>
			<path className="react-flow__edge-path" d={edgePath} />
			<EdgeLabelRenderer>
				<button
					className="mg-edge-remove"
					style={{
						position: 'absolute',
						transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
						pointerEvents: 'all',
					}}
					onClick={(e) => {
						e.stopPropagation();
						data!.onRemove(data!.sourceId, data!.targetId);
					}}
				>
					×
				</button>
			</EdgeLabelRenderer>
		</>
	);
}
