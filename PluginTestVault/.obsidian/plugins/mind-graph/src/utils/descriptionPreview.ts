export function truncateDescription(text: string, limit = 80): string {
	const normalized = text.replace(/\s+/g, ' ');
	return normalized.length > limit ? normalized.slice(0, limit) + '…' : normalized;
}
