import type { Storage } from "@gramio/storage";
import type { DataDict, DialogUpdateCtx } from "./types.ts";

/** One dialog instance on the stack (aiogram_dialog `Context`). */
export interface DialogContext {
	intentId: string;
	stackId: string;
	groupId: string;
	stateKey: string;
	startData: unknown;
	data: DataDict;
	widgetData: DataDict;
	/** Visited states for history-based `back()`. */
	history: string[];
}

/** A per-(chat,user) stack of dialog instances (aiogram_dialog `Stack`). */
export interface DialogStack {
	id: string;
	intents: DialogContext[];
	lastMessageId?: number;
	lastChatId?: number;
	hasMedia?: boolean;
	/** Whether the last rendered message had a reply keyboard. */
	lastReply?: boolean;
}

/** Max nested dialogs, mirroring aiogram_dialog's abuse guard. */
export const MAX_STACK_DEPTH = 100;

export function emptyStack(id = "default"): DialogStack {
	return { id, intents: [] };
}

/** One or more independent stacks per (chat,user) — enables `StartMode.NewStack`. */
export interface StackStore {
	stacks: DialogStack[];
	currentId: string;
}

export type GetStackKey = (ctx: DialogUpdateCtx) => string | Promise<string>;

const defaultGetStackKey: GetStackKey = (ctx) => `grd:${ctx.senderId}`;

/** Loads/saves dialog stacks through a gramio {@link Storage} adapter. */
export class StackRepository {
	constructor(
		private readonly storage: Storage,
		private readonly getKey: GetStackKey = defaultGetStackKey,
	) {}

	key(ctx: DialogUpdateCtx): string | Promise<string> {
		return this.getKey(ctx);
	}

	/** Back-compat: returns the *current* stack as a single {@link DialogStack}. */
	async load(key: string): Promise<DialogStack> {
		const store = await this.loadStore(key);
		return (
			store.stacks.find((s) => s.id === store.currentId) ??
			(store.stacks[0] as DialogStack)
		);
	}

	async save(key: string, stack: DialogStack): Promise<void> {
		await this.storage.set(key, stack);
	}

	/** Loads the full multi-stack store, normalising legacy single-stack values. */
	async loadStore(key: string): Promise<StackStore> {
		const stored = await this.storage.get(key);
		if (!stored) return { stacks: [emptyStack()], currentId: "default" };
		if ("stacks" in stored) return stored as StackStore; // already a store
		const stack = stored as DialogStack; // legacy single stack
		return { stacks: [stack], currentId: stack.id };
	}

	/** Persists a store, collapsing to a legacy single stack when only one exists. */
	async saveStore(key: string, store: StackStore): Promise<void> {
		await this.storage.set(
			key,
			store.stacks.length <= 1 ? (store.stacks[0] ?? emptyStack()) : store,
		);
	}
}
