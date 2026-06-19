import { InlineKeyboard, Keyboard } from "gramio";
import { DIALOG_CB, type DialogCodec } from "./callback.ts";
import {
	type DialogContext,
	type DialogStack,
	MAX_STACK_DEPTH,
	type StackRepository,
	type StackStore,
	emptyStack,
} from "./context.ts";
import { shortId } from "./id.ts";
import type { DialogRegistry } from "./registry.ts";
import { decodeReplyData, encodeReplyData } from "./reply.ts";
import {
	type ClickCtx,
	type DataDict,
	type DialogEventCtx,
	type DialogEvents,
	type DialogUpdateCtx,
	type I18nResolver,
	type InputCtx,
	type RawButton,
	type RenderContext,
	type RenderedMedia,
	ShowMode,
	StartMode,
	type Stringable,
	type Translator,
} from "./types.ts";

export interface ManagerInit {
	ctx: DialogUpdateCtx;
	store: StackStore;
	repo: StackRepository;
	storageKey: string;
	registry: DialogRegistry;
	/** Headless mode (background updates): `Auto` show mode edits instead of sends. */
	headless?: boolean;
	/** Resolves a translator from the update (for the `T` text widget). */
	i18n?: I18nResolver;
	/** Callback-data codec. Defaults to the built-in `"grd"` scheme. */
	codec?: DialogCodec;
	/** Overridable engine answers (stale button, access denied). */
	events?: DialogEvents;
}

/** Fallback translator when no resolver is configured: echo the key verbatim. */
const echoTranslator: Translator = (key) => key;

export interface StartOptions {
	data?: unknown;
	mode?: ShowMode;
	/** Whether to keep or reset the existing stack. Defaults to {@link StartMode.Normal}. */
	startMode?: StartMode;
}

/**
 * Telegram rejects empty message text → substitute an invisible char. Returns
 * `string` for gramio's strict `text` params; a `FormattableString` passes
 * through unchanged at runtime (gramio's format hook converts it).
 */
function emptyToPlaceholder(text: Stringable): string {
	return (text === "" ? "⁣" : text) as string;
}

/**
 * Telegram answers `400: message is not modified` when an edit would not change
 * anything (e.g. a no-op button click that re-renders the same screen). This is
 * expected and must be swallowed — NOT treated as "edit failed, send a new one".
 */
function isNotModified(error: unknown): boolean {
	const e = error as {
		message?: string;
		description?: string;
		payload?: { description?: string };
	};
	const text =
		e?.message ?? e?.description ?? e?.payload?.description ?? String(error);
	return /not modified/i.test(text);
}

/** Empty caption should be omitted entirely. */
function emptyToUndef(text: Stringable): Stringable | undefined {
	return text === "" ? undefined : text;
}

/** Build gramio ButtonOptions (icon / style) for a raw button, or undefined. */
function buttonOpts(
	b: RawButton,
): { icon_custom_emoji_id?: string; style?: RawButton["style"] } | undefined {
	if (!b.iconEmojiId && !b.style) return undefined;
	return { icon_custom_emoji_id: b.iconEmojiId, style: b.style };
}

const cbEncoder = new TextEncoder();
const warnedWidgets = new Set<string>();

/**
 * Test/diagnostic hook: clear the "callback_data too long" once-per-widget
 * dedup set so the warning's once-only semantics can be asserted deterministically.
 */
export function __resetCallbackWarnings(): void {
	warnedWidgets.clear();
}

/**
 * Telegram rejects inline buttons whose `callback_data` exceeds 64 bytes — the
 * whole `sendMessage` fails. Warn (once per widget) so it's caught in dev
 * instead of surfacing as "the keyboard silently doesn't work".
 */
function warnIfTooLong(data: string, widgetId: string): void {
	if (cbEncoder.encode(data).length <= 64 || warnedWidgets.has(widgetId))
		return;
	warnedWidgets.add(widgetId);
	console.warn(
		`[@gramio/dialogs] callback_data for widget "${widgetId}" is ${cbEncoder.encode(data).length} bytes (> 64). Telegram will reject this keyboard. Use a short item id (e.g. a list index) instead of long strings as the payload.`,
	);
}

/**
 * Facade over a user's dialog stack, bound to one incoming update.
 *
 * Exposed to handlers as `ctx.dialog`. Mirrors aiogram_dialog's
 * `DialogManager`: `start` / `switchTo` / `back` / `next` / `done` / `update`
 * mutate the stack and auto-render; `show` renders the current window.
 */
export class DialogManager {
	readonly ctx: DialogUpdateCtx;
	private readonly store: StackStore;
	private readonly repo: StackRepository;
	private readonly storageKey: string;
	private readonly registry: DialogRegistry;
	private readonly headless: boolean;
	private readonly i18nResolver?: I18nResolver;
	private readonly codec: DialogCodec;
	private readonly events: DialogEvents;
	/** Lazily-resolved translator for this update (cached after first use). */
	private translator?: Translator;

	/** Bumped every time a real send/edit happens — used to detect re-render need. */
	renderCount = 0;

	/** widget-data namespaces pushed by container widgets (e.g. ListGroup). */
	private readonly scopes: string[] = [];
	/** id of the ListGroup item currently being processed, if any. */
	listItemId?: string;

	constructor(init: ManagerInit) {
		this.ctx = init.ctx;
		this.store = init.store;
		this.repo = init.repo;
		this.storageKey = init.storageKey;
		this.registry = init.registry;
		this.headless = init.headless ?? false;
		this.i18nResolver = init.i18n;
		this.codec = init.codec ?? DIALOG_CB;
		this.events = init.events ?? {};
		this.attachContext();
	}

	/**
	 * Resolve a translation key to text via the configured i18n resolver (or, if
	 * none, a `ctx.t` on the update — the `@gramio/i18n` convention — falling back
	 * to echoing the key). Used by the {@link T} text widget.
	 */
	t(key: string, params?: Record<string, unknown>): Stringable {
		if (!this.translator) {
			const ctxT = (this.ctx as { t?: Translator }).t;
			let resolved: Translator | undefined;
			try {
				// A user resolver may throw (e.g. touching `ctx.from` in headless
				// mode) — degrade gracefully instead of crashing the render.
				resolved = this.i18nResolver?.(this.ctx);
			} catch {
				resolved = undefined;
			}
			this.translator = resolved ?? ctxT ?? echoTranslator;
		}
		return this.translator(key, params);
	}

	/**
	 * Expose the dialog navigation surface on the gramio context so handlers can
	 * call `ctx.switchTo(...)` etc. `ctx.data`/`ctx.update` stay gramio's, so
	 * dialog data is `ctx.dialogData` and start params are `ctx.params`.
	 */
	private attachContext(): void {
		const ctx = this.ctx as unknown as Record<string, unknown>;
		ctx.dialog = this;
		ctx.switchTo = (state: string, mode?: ShowMode) =>
			this.switchTo(state, mode);
		ctx.back = (mode?: ShowMode) => this.back(mode);
		ctx.next = (mode?: ShowMode) => this.next(mode);
		ctx.done = (result?: unknown, mode?: ShowMode) => this.done(result, mode);
		ctx.start = (
			dialog: string | { id: string },
			state?: string,
			options?: StartOptions,
		) => this.start(dialog, state, options);
		ctx.show = (mode?: ShowMode) => this.show(mode);
		ctx.widgetData = (id: string, fallback: unknown) =>
			this.widgetData(id, fallback);
		Object.defineProperty(ctx, "dialogData", {
			configurable: true,
			get: () => this.data,
		});
		Object.defineProperty(ctx, "params", {
			configurable: true,
			get: () => this.startData,
		});
	}

	/** The currently-active stack (multi-stack support; usually just "default"). */
	get stack(): DialogStack {
		const current = this.store.stacks.find(
			(s) => s.id === this.store.currentId,
		);
		if (current) return current;
		const fallback = this.store.stacks[0] ?? emptyStack();
		if (this.store.stacks.length === 0) this.store.stacks.push(fallback);
		this.store.currentId = fallback.id;
		return fallback;
	}

	// ───────────────────────── data accessors ─────────────────────────

	/** Active dialog instance, or `undefined` if the stack is empty. */
	get context(): DialogContext | undefined {
		return this.stack.intents.at(-1);
	}

	/** Visited window states of the active dialog: the back-history + current state. */
	get history(): string[] {
		const context = this.context;
		if (!context) return [];
		return [...context.history, context.stateKey];
	}

	private requireContext(): DialogContext {
		const context = this.context;
		if (!context) throw new Error("No active dialog on the stack");
		return context;
	}

	/** Mutable per-dialog data (aiogram_dialog `dialog_data`). */
	get data(): DataDict {
		return this.requireContext().data;
	}

	/** Data passed to `start()` (aiogram_dialog `start_data`). */
	get startData(): unknown {
		return this.requireContext().startData;
	}

	private scopedId(widgetId: string): string {
		return this.scopes.length > 0
			? `${this.scopes.join("/")}/${widgetId}`
			: widgetId;
	}

	/** @internal Push a widget-data namespace (used by ListGroup per item). */
	pushScope(scope: string): void {
		this.scopes.push(scope);
	}

	/** @internal Pop the most recent widget-data namespace. */
	popScope(): void {
		this.scopes.pop();
	}

	/** Mutable per-widget data store, keyed by (scoped) widget id. */
	widgetData<T = unknown>(widgetId: string, fallback: T): T {
		const store = this.requireContext().widgetData;
		const key = this.scopedId(widgetId);
		if (!(key in store)) store[key] = fallback;
		return store[key] as T;
	}

	setWidgetData(widgetId: string, value: unknown): void {
		this.requireContext().widgetData[this.scopedId(widgetId)] = value;
	}

	// ───────── typed widget-state accessors (aiogram_dialog `manager.find`) ─────────

	/** Read/write a {@link Counter}'s value programmatically. */
	counter(id: string): { get(): number; set(value: number): void } {
		return {
			get: () => this.widgetData<number>(id, 0),
			set: (value) => this.setWidgetData(id, value),
		};
	}

	/** Read/write/toggle a {@link Checkbox}. */
	checkbox(id: string): {
		checked(): boolean;
		set(value: boolean): void;
		toggle(): void;
	} {
		return {
			checked: () => this.widgetData<boolean>(id, false),
			set: (value) => this.setWidgetData(id, value),
			toggle: () =>
				this.setWidgetData(id, !this.widgetData<boolean>(id, false)),
		};
	}

	/** Read/write a {@link Radio} selection. */
	radio(id: string): {
		selected(): string | undefined;
		set(value: string): void;
	} {
		return {
			selected: () => this.widgetData<string | undefined>(id, undefined),
			set: (value) => this.setWidgetData(id, value),
		};
	}

	/** Read/write/toggle a {@link Multiselect} selection. */
	multiselect(id: string): {
		selected(): string[];
		isSelected(item: string): boolean;
		set(value: string[]): void;
		toggle(item: string): void;
	} {
		const read = () => this.widgetData<string[]>(id, []);
		return {
			selected: () => [...read()],
			isSelected: (item) => read().includes(item),
			set: (value) => this.setWidgetData(id, [...value]),
			toggle: (item) => {
				const next = read();
				const at = next.indexOf(item);
				if (at >= 0) next.splice(at, 1);
				else next.push(item);
				this.setWidgetData(id, next);
			},
		};
	}

	// ───────────────────────── navigation ─────────────────────────

	async start(
		dialogRef: string | { id: string },
		stateKey?: string,
		options: StartOptions = {},
	): Promise<void> {
		const groupId = typeof dialogRef === "string" ? dialogRef : dialogRef.id;
		const dialog = this.registry.get(groupId);
		const startMode = options.startMode ?? StartMode.Normal;
		if (startMode === StartMode.NewStack) {
			// open in a fresh, independent stack (the old one stays alive)
			const fresh = emptyStack(shortId());
			this.store.stacks.push(fresh);
			this.store.currentId = fresh.id;
		} else if (startMode === StartMode.ResetStack) {
			// drop every dialog (and their widget state) so the new one stands alone
			this.stack.intents.length = 0;
		}
		if (this.stack.intents.length >= MAX_STACK_DEPTH)
			throw new Error(`Dialog stack overflow (> ${MAX_STACK_DEPTH})`);

		const context: DialogContext = {
			intentId: shortId(),
			stackId: this.stack.id,
			groupId,
			stateKey: stateKey ?? dialog.firstState,
			startData: options.data,
			data: {},
			widgetData: {},
			history: [],
		};
		dialog.getWindow(context.stateKey); // validate
		this.stack.intents.push(context);
		await dialog.onStart?.(this, options.data);
		await this.render(options.mode ?? ShowMode.Auto);
		await this.persist();
	}

	async switchTo(
		stateKey: string,
		mode: ShowMode = ShowMode.Auto,
	): Promise<void> {
		const context = this.requireContext();
		this.registry.get(context.groupId).getWindow(stateKey); // validate
		if (stateKey !== context.stateKey) {
			context.history.push(context.stateKey); // remember where we came from
			if (context.history.length > MAX_STACK_DEPTH) context.history.shift();
		}
		context.stateKey = stateKey;
		await this.render(mode);
		await this.persist();
	}

	/** History-based: return to the window we came from (aiogram_dialog-style back). */
	async back(mode: ShowMode = ShowMode.Auto): Promise<void> {
		const context = this.requireContext();
		const previous = context.history.pop();
		if (previous === undefined) return;
		this.registry.get(context.groupId).getWindow(previous); // validate
		context.stateKey = previous;
		await this.render(mode);
		await this.persist();
	}

	/** Move to the next window in declaration order (for linear wizards). */
	async next(mode: ShowMode = ShowMode.Auto): Promise<void> {
		await this.step(1, mode);
	}

	private async step(delta: 1 | -1, mode: ShowMode): Promise<void> {
		const context = this.requireContext();
		const target = this.registry
			.get(context.groupId)
			.siblingState(context.stateKey, delta);
		if (!target) return;
		if (target !== context.stateKey) {
			// Remember where we came from so a paired Back() undoes this step
			// (mirrors switchTo — otherwise Next→Back does nothing in a wizard).
			context.history.push(context.stateKey);
			if (context.history.length > MAX_STACK_DEPTH) context.history.shift();
		}
		context.stateKey = target;
		await this.render(mode);
		await this.persist();
	}

	async done(result?: unknown, mode: ShowMode = ShowMode.Auto): Promise<void> {
		const closing = this.stack.intents.pop();
		if (!closing) return;
		await this.registry.get(closing.groupId).onClose?.(this, result);

		const parent = this.context;
		if (parent) {
			await this.registry
				.get(parent.groupId)
				.onProcessResult?.(this, closing.startData, result);
			await this.render(mode);
		} else {
			const chatId = this.stack.lastChatId;
			if (chatId !== undefined) {
				await this.dismissReplyKeyboard(chatId);
				if (this.stack.lastMessageId !== undefined)
					await this.ctx.bot.api
						.deleteMessage({
							chat_id: chatId,
							message_id: this.stack.lastMessageId,
						})
						.catch(() => undefined);
			}
		}
		await this.persist();
	}

	/** Merge data into the current dialog's `data` and re-render. */
	async update(data: DataDict, mode: ShowMode = ShowMode.Auto): Promise<void> {
		Object.assign(this.requireContext().data, data);
		await this.render(mode);
		await this.persist();
	}

	/** Render the current window without changing state. */
	async show(mode: ShowMode = ShowMode.Auto): Promise<void> {
		await this.render(mode);
		await this.persist();
	}

	// ───────────────────────── handler-facing contexts ─────────────────────────

	get clickCtx(): ClickCtx {
		return this.ctx as ClickCtx;
	}

	get inputCtx(): InputCtx {
		return this.ctx as InputCtx;
	}

	// ───────────────────────── rendering ─────────────────────────

	private async render(mode: ShowMode): Promise<void> {
		const context = this.context;
		if (!context) return;
		const dialog = this.registry.get(context.groupId);
		const window = dialog.getWindow(context.stateKey);

		const gctx = this.ctx as DialogUpdateCtx & { dialog: DialogManager };
		const data: DataDict = {};
		if (dialog.getter) Object.assign(data, await dialog.getter(gctx));
		if (window.getter) Object.assign(data, await window.getter(gctx));
		data.dialogData = context.data;
		data.startData = context.startData;

		const rc: RenderContext = { data, manager: this };
		const text = window.text ? await window.text.renderText(rc) : "";
		const media = window.media ? await window.media.renderMedia(rc) : undefined;
		const rows = window.keyboard
			? await window.keyboard.renderKeyboard(rc)
			: [];

		if (window.reply) {
			const markup = this.buildReplyKeyboard(rows, context.intentId);
			await this.deliverReply(text, media, markup);
		} else {
			const keyboard = this.buildKeyboard(rows, context.intentId);
			await this.deliver(text, media, keyboard, mode, window.disableWebPreview);
		}
		this.renderCount++;
	}

	private buildKeyboard(
		rows: RawButton[][],
		intentId: string,
	): InlineKeyboard | undefined {
		const filled = rows.filter((row) => row.length > 0);
		if (filled.length === 0) return undefined;

		const keyboard = new InlineKeyboard();
		filled.forEach((row, index) => {
			if (index > 0) keyboard.row();
			for (const button of row) {
				const opts = buttonOpts(button);
				if (button.url) keyboard.url(button.text, button.url, opts);
				else if (button.webApp)
					keyboard.webApp(button.text, button.webApp, opts);
				else if (button.switchInline)
					button.switchInline.currentChat
						? keyboard.switchToCurrentChat(
								button.text,
								button.switchInline.query,
								opts,
							)
						: keyboard.switchToChat(
								button.text,
								button.switchInline.query,
								opts,
							);
				else if (button.cb) {
					const data = this.codec.pack(
						button.cb.payload === undefined
							? { i: intentId, w: button.cb.widgetId }
							: { i: intentId, w: button.cb.widgetId, p: button.cb.payload },
					);
					warnIfTooLong(data, button.cb.widgetId);
					keyboard.text(button.text, data, opts);
				}
			}
		});
		return keyboard;
	}

	private buildReplyKeyboard(
		rows: RawButton[][],
		intentId: string,
	): Keyboard | undefined {
		const filled = rows.filter((row) => row.length > 0);
		if (filled.length === 0) return undefined;

		const keyboard = new Keyboard().resized();
		filled.forEach((row, index) => {
			if (index > 0) keyboard.row();
			for (const button of row) {
				if (button.request) {
					this.addRequestButton(keyboard, button);
					continue;
				}
				const label = button.cb
					? button.text +
						encodeReplyData(
							button.cb.payload === undefined
								? this.codec.pack({ i: intentId, w: button.cb.widgetId })
								: this.codec.pack({
										i: intentId,
										w: button.cb.widgetId,
										p: button.cb.payload,
									}),
						)
					: button.text;
				keyboard.text(label, buttonOpts(button));
			}
		});
		return keyboard;
	}

	/** Emit a reply-keyboard request button (users / chat / contact / location). */
	private addRequestButton(keyboard: Keyboard, button: RawButton): void {
		const request = button.request;
		if (!request) return;
		const reqId = request.requestId ?? 1;
		switch (request.kind) {
			case "users":
				keyboard.requestUsers(
					button.text,
					reqId,
					request.options as Parameters<Keyboard["requestUsers"]>[2],
				);
				break;
			case "chat":
				keyboard.requestChat(
					button.text,
					reqId,
					request.options as Parameters<Keyboard["requestChat"]>[2],
				);
				break;
			case "contact":
				keyboard.requestContact(button.text);
				break;
			case "location":
				keyboard.requestLocation(button.text);
				break;
		}
	}

	private async deliverReply(
		text: Stringable,
		media: RenderedMedia | undefined,
		keyboard: Keyboard | undefined,
	): Promise<void> {
		// Reply keyboards can't be edited in place — always send a fresh message.
		const chatId = this.chatId();
		if (media) {
			const sent = await this.sendMedia(chatId, media, text, keyboard);
			this.stack.lastMessageId = sent.message_id;
			this.stack.hasMedia = true;
		} else {
			const sent = await this.ctx.bot.api.sendMessage({
				chat_id: chatId,
				text: emptyToPlaceholder(text),
				reply_markup: keyboard,
			});
			this.stack.lastMessageId = sent.message_id;
			this.stack.hasMedia = false;
		}
		this.stack.lastChatId = chatId;
		this.stack.lastReply = true;
	}

	private chatId(): number {
		return (this.ctx.chatId ?? this.ctx.senderId) as number;
	}

	private async dismissReplyKeyboard(chatId: number): Promise<void> {
		if (!this.stack.lastReply) return;
		const msg = await this.ctx.bot.api
			.sendMessage({
				chat_id: chatId,
				text: emptyToPlaceholder(""),
				reply_markup: { remove_keyboard: true },
			})
			.catch(() => undefined);
		if (msg)
			await this.ctx.bot.api
				.deleteMessage({ chat_id: chatId, message_id: msg.message_id })
				.catch(() => undefined);
		this.stack.lastReply = false;
	}

	private async deliver(
		text: Stringable,
		media: RenderedMedia | undefined,
		keyboard: InlineKeyboard | undefined,
		mode: ShowMode,
		disableWebPreview = false,
	): Promise<void> {
		const linkPreview = disableWebPreview ? { is_disabled: true } : undefined;
		const chatId = this.chatId();
		if (this.stack.lastReply) await this.dismissReplyKeyboard(chatId);
		const lastMessageId = this.stack.lastMessageId;
		const wantsEdit =
			mode === ShowMode.Edit ||
			(mode === ShowMode.Auto &&
				(this.headless || this.ctx.is("callback_query")));
		const hadMedia = this.stack.hasMedia ?? false;

		const deleteOld = async (): Promise<void> => {
			if (lastMessageId !== undefined)
				await this.ctx.bot.api
					.deleteMessage({ chat_id: chatId, message_id: lastMessageId })
					.catch(() => undefined);
		};

		if (media) {
			// media↔media can be edited; text→media cannot — delete & resend.
			if (wantsEdit && lastMessageId !== undefined && hadMedia) {
				try {
					await this.ctx.bot.api.editMessageMedia({
						chat_id: chatId,
						message_id: lastMessageId,
						media: {
							type: media.type,
							media: media.media,
							caption: emptyToUndef(text),
						},
						reply_markup: keyboard,
					});
					this.stack.hasMedia = true;
					return;
				} catch (error) {
					if (isNotModified(error)) return;
					// otherwise the message can't be edited → resend below
				}
			}
			if (wantsEdit || mode === ShowMode.Delete) await deleteOld();
			const sent = await this.sendMedia(chatId, media, text, keyboard);
			this.stack.lastMessageId = sent.message_id;
			this.stack.lastChatId = chatId;
			this.stack.hasMedia = true;
			return;
		}

		// text-only
		if (wantsEdit && lastMessageId !== undefined && !hadMedia) {
			try {
				await this.ctx.bot.api.editMessageText({
					chat_id: chatId,
					message_id: lastMessageId,
					text: emptyToPlaceholder(text),
					reply_markup: keyboard,
					link_preview_options: linkPreview,
				});
				this.stack.hasMedia = false;
				return;
			} catch (error) {
				if (isNotModified(error)) return;
				// otherwise the message can't be edited → resend below
			}
		}
		// editing a media message into text isn't possible → delete & resend
		if ((wantsEdit && hadMedia) || mode === ShowMode.Delete) await deleteOld();

		const sent = await this.ctx.bot.api.sendMessage({
			chat_id: chatId,
			text: emptyToPlaceholder(text),
			reply_markup: keyboard,
			link_preview_options: linkPreview,
		});
		this.stack.lastMessageId = sent.message_id;
		this.stack.lastChatId = chatId;
		this.stack.hasMedia = false;
	}

	private sendMedia(
		chatId: number,
		media: RenderedMedia,
		caption: Stringable,
		keyboard: InlineKeyboard | Keyboard | undefined,
	): Promise<{ message_id: number }> {
		const cap = emptyToUndef(caption);
		const api = this.ctx.bot.api;
		switch (media.type) {
			case "photo":
				return api.sendPhoto({
					chat_id: chatId,
					photo: media.media,
					caption: cap,
					reply_markup: keyboard,
				});
			case "video":
				return api.sendVideo({
					chat_id: chatId,
					video: media.media,
					caption: cap,
					reply_markup: keyboard,
				});
			case "animation":
				return api.sendAnimation({
					chat_id: chatId,
					animation: media.media,
					caption: cap,
					reply_markup: keyboard,
				});
			case "audio":
				return api.sendAudio({
					chat_id: chatId,
					audio: media.media,
					caption: cap,
					reply_markup: keyboard,
				});
			case "document":
				return api.sendDocument({
					chat_id: chatId,
					document: media.media,
					caption: cap,
					reply_markup: keyboard,
				});
		}
	}

	private async persist(): Promise<void> {
		if (this.store.stacks.length > 1) {
			// if the current stack drained empty, fall back to another live stack…
			const current = this.store.stacks.find(
				(s) => s.id === this.store.currentId,
			);
			if (current && current.intents.length === 0) {
				const other =
					this.store.stacks.find(
						(s) => s.id !== current.id && s.intents.length > 0,
					) ?? this.store.stacks.find((s) => s.id !== current.id);
				if (other) this.store.currentId = other.id;
			}
			// …then prune the empty parallel stacks
			this.store.stacks = this.store.stacks.filter(
				(s) => s.intents.length > 0 || s.id === this.store.currentId,
			);
		}
		await this.repo.saveStore(this.storageKey, this.store);
	}

	// ───────────────────────── engine entry points (internal) ─────────────────────────

	/**
	 * Route a packed dialog callback into the active window.
	 * `"foreign"` = not ours, `"stale"` = wrong dialog instance, `"handled"` = done.
	 */
	/** Run a dialog's access validator (if any). `true` = the interaction is allowed. */
	private async accessAllowed(groupId: string): Promise<boolean> {
		const access = this.registry.get(groupId).access;
		if (!access) return true;
		return (await access(this.ctx as DialogEventCtx)) === true;
	}

	/** Close the callback spinner with no text (tolerates messages with no `answer`). */
	private async silentAnswer(): Promise<void> {
		const answer = (this.ctx as { answer?: (t?: string) => Promise<unknown> })
			.answer;
		await answer?.()?.catch(() => undefined);
	}

	private async routePacked(
		packed: string,
	): Promise<"foreign" | "stale" | "denied" | "handled"> {
		if (!this.codec.filter(packed)) return "foreign";
		const unpacked = this.codec.safeUnpack(packed);
		if (!unpacked.success) return "foreign";

		// multi-stack: route to whichever stack's active dialog owns this intent
		const owner = this.store.stacks.find(
			(s) => s.intents.at(-1)?.intentId === unpacked.data.i,
		);
		if (owner) this.store.currentId = owner.id;

		const context = this.context;
		if (!context) return "handled";
		if (unpacked.data.i !== context.intentId) return "stale";

		const dialog = this.registry.get(context.groupId);
		if (!(await this.accessAllowed(context.groupId))) {
			// Precedence: per-dialog handler → global event → silent answer.
			const handler = dialog.onAccessDenied ?? this.events.onAccessDenied;
			if (handler) await handler(this.ctx as DialogEventCtx);
			else await this.silentAnswer();
			return "denied";
		}

		const window = dialog.getWindow(context.stateKey);
		const before = this.renderCount;
		let handled = false;
		if (window.keyboard)
			handled = await window.keyboard.processCallback(
				unpacked.data.w,
				unpacked.data.p,
				this,
			);

		if (handled && this.renderCount === before)
			await this.render(ShowMode.Edit);
		await this.persist();
		return "handled";
	}

	/** @internal Routes an incoming callback query into the active window. */
	async _handleCallback(): Promise<boolean> {
		if (!this.ctx.is("callback_query")) return false;
		const data = this.ctx.data;
		if (!data) return false;

		const result = await this.routePacked(data);
		if (result === "foreign") return false;
		if (result === "stale") {
			// No hard-coded text: run the configured hook, or just close the spinner.
			if (this.events.onStale)
				await this.events.onStale(this.ctx as DialogEventCtx);
			else await this.silentAnswer();
			return true;
		}
		// "denied" was already answered inside routePacked (or routed to onAccessDenied).
		if (result === "denied") return true;
		await this.ctx.answer().catch(() => undefined);
		return true;
	}

	/** @internal Routes an incoming message: reply-keyboard callback, then input. */
	async _handleMessage(): Promise<boolean> {
		if (!this.ctx.is("message")) return false;
		const context = this.context;
		if (!context) return false;

		// Reply-keyboard button taps arrive as messages with an invisible payload.
		const text = this.ctx.text;
		if (text) {
			const decoded = decodeReplyData(text);
			if (decoded) {
				// onClick handlers expect ctx.answer(); messages have none → shim it.
				const shimmed = this.ctx as { answer?: () => Promise<true> };
				if (!shimmed.answer) shimmed.answer = async () => true;
				const result = await this.routePacked(decoded.data);
				if (result !== "foreign") return true;
			}
		}

		// Access denial silently ignores plain messages (no answer to give) and
		// lets them fall through to other handlers.
		if (!(await this.accessAllowed(context.groupId))) return false;

		const window = this.registry
			.get(context.groupId)
			.getWindow(context.stateKey);

		if (window.input && (await window.input.processInput(this.inputCtx))) {
			await this.persist();
			return true;
		}
		if (!window.onMessage) return false;

		await window.onMessage(this.inputCtx);
		await this.persist();
		return true;
	}
}
