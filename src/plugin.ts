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
 */
function headlessCtx(bot: BotLikeApi, chatId: number): DialogUpdateCtx {
	return {
		is: () => false,
		chatId,
		senderId: chatId,
		from: { id: chatId },
		bot,
		answer: async () => true,
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
			if (!(await ctx.dialog._handleCallback())) return next();
		})
		.on("message", async (ctx, next) => {
			if (!(await ctx.dialog._handleMessage())) return next();
		});

	/**
	 * Get a headless {@link DialogManager} for a user's stack, to edit its last
	 * message from outside a handler. `switchTo` / `update` / `show` default to
	 * editing. Throws if the stack has never been rendered (no message to edit).
	 */
	async function background(
		bot: BotLikeApi,
		stackKey: string,
	): Promise<DialogManager> {
		const store = await repo.loadStore(stackKey);
		const current =
			store.stacks.find((s) => s.id === store.currentId) ?? store.stacks[0];
		if (current?.lastChatId === undefined)
			throw new Error(`Stack "${stackKey}" has no rendered message to update`);
		return new DialogManager({
			ctx: headlessCtx(bot, current.lastChatId),
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

	return { plugin, background };
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
