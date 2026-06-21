import { type Storage, inMemoryStorage } from "@gramio/storage";
import type { Bot } from "gramio";
import { Plugin } from "gramio";
import { type CallbackOptions, makeCodec } from "./callback.ts";
import { type GetStackKey, StackRepository } from "./context.ts";
import type { Dialog } from "./dialog.ts";
import { DialogManager } from "./manager.ts";
import { DialogRegistry } from "./registry.ts";
import type { DialogEvents, DialogUpdateCtx, I18nResolver } from "./types.ts";

export interface DialogsOptions {
	/** Where dialog stacks are persisted. Defaults to in-memory (dev only). */
	storage?: Storage;
	/** Derive the storage key for a stack. Defaults to `grd:<senderId>`. */
	getStackKey?: GetStackKey;
	/**
	 * Resolve a translator from each update for the `T` text widget — e.g.
	 * `i18n: (ctx) => ctx.t` to plug in `@gramio/i18n`. When omitted, `T` falls
	 * back to a `ctx.t` on the update if present, otherwise echoes the key.
	 */
	i18n?: I18nResolver;
	/**
	 * Customise the button `callback_data` codec — rename the `"grd"` prefix
	 * (`{ name }`) or plug a fully custom `{ pack, unpack }` pair.
	 */
	callback?: CallbackOptions;
	/**
	 * Overridable engine answers (stale-button tap, access denied). Each hook is
	 * optional; by default the engine answers **silently** (no hard-coded text).
	 */
	events?: DialogEvents;
}

/** Minimal bot shape the background manager needs. */
type BotLikeApi = { api: Bot["api"] };

/**
 * Synthetic context for headless (background) renders — edits the last message.
 *
 * In private chats `chatId === senderId === userId`, so we synthesize `from.id`
 * too: getters written for the interactive path (`ctx.from.id`) keep working
 * when re-rendered from `background()` instead of crashing on `undefined.id`.
 *
 * It carries only identity, though — `ctx.t`, `from.language_code`,
 * `from.username`, `ctx.message`, etc. are absent. A getter/i18n-resolver that
 * needs them must derive from `from.id`, or the caller can pass `overrides` (e.g.
 * the real `from` with a locale) to {@link createDialogs}'s `background`.
 */
function headlessCtx(
	bot: BotLikeApi,
	chatId: number,
	overrides?: Partial<DialogUpdateCtx>,
): DialogUpdateCtx {
	return {
		is: () => false,
		chatId,
		senderId: chatId,
		from: { id: chatId, is_bot: false },
		bot,
		answer: async () => true,
		...overrides,
	} as unknown as DialogUpdateCtx;
}

/**
 * Build the dialog engine. Returns the GramIO `plugin` (richly typed — adds
 * `ctx.dialog`) plus a `background` factory for updating a dialog's message
 * outside of an incoming update (timers, webhooks, queue workers).
 */
export function createDialogs(list: Dialog[], options: DialogsOptions = {}) {
	const registry = new DialogRegistry(list);
	const repo = new StackRepository(
		options.storage ?? inMemoryStorage(),
		options.getStackKey,
	);
	const codec = makeCodec(options.callback);

	const plugin = new Plugin("@gramio/dialogs")
		.derive(["message", "callback_query"], async (ctx) => {
			const storageKey = await repo.key(ctx as DialogUpdateCtx);
			const store = await repo.loadStore(storageKey);
			const manager = new DialogManager({
				ctx: ctx as DialogUpdateCtx,
				store,
				repo,
				storageKey,
				registry,
				i18n: options.i18n,
				codec,
				events: options.events,
			});
			return { dialog: manager };
		})
		.on("callback_query", async (ctx, next) => {
			// Per-key lock + reload-under-lock: serialize concurrent updates on the
			// same stack key so they can't read a stale store and clobber each other.
			const handled = await repo.withLock(ctx.dialog.storageKey, async () => {
				await ctx.dialog._reloadStore();
				return ctx.dialog._handleCallback();
			});
			if (!handled) return next();
		})
		.on("message", async (ctx, next) => {
			const handled = await repo.withLock(ctx.dialog.storageKey, async () => {
				await ctx.dialog._reloadStore();
				return ctx.dialog._handleMessage();
			});
			if (!handled) return next();
		});

	/**
	 * Get a headless {@link DialogManager} for a user's stack, to edit its last
	 * message from outside a handler. `switchTo` / `update` / `show` default to
	 * editing. Throws if the stack has never been rendered (no message to edit).
	 *
	 * Pass `overrides` to enrich the synthetic ctx — e.g. the real `from` (with a
	 * `language_code`) or a `t` translator — so getters / i18n that need more than
	 * `from.id` work in the background render.
	 *
	 * To avoid a lost-update race with a concurrent live tap on the same key, wrap
	 * the load+mutate in {@link withLock}:
	 * `await withLock(key, async () => { const m = await background(bot, key); await m.switchTo(...); })`.
	 */
	async function background(
		bot: BotLikeApi,
		stackKey: string,
		overrides?: Partial<DialogUpdateCtx>,
	): Promise<DialogManager> {
		const store = await repo.loadStore(stackKey);
		const current =
			store.stacks.find((s) => s.id === store.currentId) ?? store.stacks[0];
		if (current?.lastChatId === undefined)
			throw new Error(`Stack "${stackKey}" has no rendered message to update`);
		return new DialogManager({
			ctx: headlessCtx(bot, current.lastChatId, overrides),
			store,
			repo,
			storageKey: stackKey,
			registry,
			headless: true,
			i18n: options.i18n,
			codec,
			events: options.events,
		});
	}

	/**
	 * Keyed async mutex over a stack key — wrap `background()` work in it to
	 * serialize against live taps (and other background renders) on the same key.
	 * The live update path already uses this internally. Single-process only.
	 */
	const withLock = <T>(key: string, fn: () => Promise<T>): Promise<T> =>
		repo.withLock(key, fn);

	return { plugin, background, withLock };
}

/**
 * The dialog engine plugin (sugar over {@link createDialogs}).
 *
 * - Derives `ctx.dialog` (a {@link DialogManager}) onto messages & callbacks.
 * - Routes dialog callbacks/messages into the active window, then falls
 *   through (`next()`) for everything it doesn't own.
 *
 * Use {@link createDialogs} instead if you need background updates.
 */
export function dialogs(list: Dialog[], options: DialogsOptions = {}) {
	return createDialogs(list, options).plugin;
}
