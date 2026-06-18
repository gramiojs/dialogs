import type { Dialog } from "./dialog.ts";

/** Maps state-group id → {@link Dialog}, like aiogram_dialog's DialogRegistry. */
export class DialogRegistry {
	private readonly byId = new Map<string, Dialog>();

	constructor(dialogs: Dialog[]) {
		for (const dialog of dialogs) {
			if (this.byId.has(dialog.id))
				throw new Error(`Duplicate dialog id "${dialog.id}"`);
			this.byId.set(dialog.id, dialog);
		}
	}

	get(id: string): Dialog {
		const dialog = this.byId.get(id);
		if (!dialog) throw new Error(`No dialog registered with id "${id}"`);
		return dialog;
	}

	has(id: string): boolean {
		return this.byId.has(id);
	}
}
