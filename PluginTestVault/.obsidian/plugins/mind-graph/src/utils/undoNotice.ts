import { Notice } from 'obsidian';

export function showUndoNotice(message: string, onUndo: () => Promise<void>): void {
	const frag = activeDocument.createDocumentFragment();

	const msgSpan = activeDocument.createElement('span');
	msgSpan.textContent = message;
	frag.appendChild(msgSpan);

	const btn = activeDocument.createElement('button');
	btn.textContent = 'Undo';
	frag.appendChild(btn);

	const notice = new Notice(frag, 5000);
	btn.addEventListener('click', () => {
		void onUndo().then(() => notice.hide());
	});
}
