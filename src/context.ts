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
	/** Per-key tail promises for {@link withLock} (a keyed async mutex). */
	private readonly locks = new Map<string, Promise<void>>();

	constructor(
		private readonly storage: Storage,
		private readonly getKey: GetStackKey = defaultGetStackKey,
	) {}

	key(ctx: DialogUpdateCtx): string | Promise<string> {
		return this.getKey(ctx);
	}

	/**
	 * Serialize an async critical section per stack key (a keyed async mutex).
	 *
	 * `loadStore → mutate → saveStore` is a read-modify-write with no CAS: two
	 * overlapping updates on the same key would each load a snapshot and the last
	 * writer would clobber the other (lost update). The engine wraps every live
	 * update in this lock and re-reads the store inside it. Wrap your own
	 * `background()` work in `withLock(sameKey, …)` to serialize it against live
	 * taps. Single-process only (an in-memory mutex; use storage-level locking for
	 * multi-process deployments).
	 */
	async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prev = this.locks.get(key) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.locks.set(key, current);
		await prev; // wait for the previous holder of this key to finish
		try {
			return await fn();
		} finally {
			release();
			// Drop the entry once we're the tail, so the Map doesn't grow unbounded.
			if (this.locks.get(key) === current) this.locks.delete(key);
		}
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
