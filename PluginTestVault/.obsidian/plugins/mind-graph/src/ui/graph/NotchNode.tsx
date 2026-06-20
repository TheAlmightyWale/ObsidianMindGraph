import React from 'react';
import { type Node, type NodeProps } from '@xyflow/react';

type NotchNodeData = Record<string, unknown> & { label: number };

export type NotchNodeType = Node<NotchNodeData>;

export function NotchNode({ data }: NodeProps<NotchNodeType>) {
	return <div className="mg-notch-label">#{data?.label}</div>;
}
