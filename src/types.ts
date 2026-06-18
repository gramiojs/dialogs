import type { Bot, ContextType } from "gramio";
import type { DialogManager, StartOptions } from "./manager.ts";

export type MaybePromise<T> = T | Promise<T>;

/**
 * Matches Telegram's `text`/`caption` param type. A `FormattableString` from
 * `@gramio/format` satisfies this and is auto-converted to text + entities by
 * gramio's built-in format hook — so widgets can return formatted text.
 */
export type Stringable = string | { toString(): string };

/** Plain JSON-serializable bag used for dialog/widget data. */
export type DataDict = Record<string, unknown>;

/** gramio contexts the dialog engine listens on. */
export type CallbackCtx = ContextType<Bot, "callback_query">;
export type MessageCtx = ContextType<Bot, "message">;
export type DialogUpdateCtx = CallbackCtx | MessageCtx;

/**
 * Flat navigation surface attached to handler contexts — lets you call
 * `ctx.switchTo(...)` instead of `ctx.dialog.switchTo(...)`.
 *
 * Note: `ctx.data` (Telegram callback_data) and `ctx.update` (raw update) belong
 * to gramio, so dialog data is exposed as `ctx.dialogData` and start params as
 * `ctx.params`. The full manager is always available via `ctx.dialog`.
 */
/** A reference to a dialog to start: its string id, or the {@link Dialog} itself. */
export type DialogRef = string | { id: string };

/**
 * The state-key union carried by a `TypedDialog` (from `defineDialog().build()`),
 * or `string` for a plain id / untyped dialog. Lets `start(target, state)` check
 * the target dialog's states at compile time.
 */
export type StatesOf<Ref> = Ref extends { __types?: { state: infer S } }
	? S & string
	: string;

/** The `params` type carried by a `TypedDialog`, or `unknown` for a plain ref. */
export type StartParamsOf<Ref> = Ref extends { __types?: { params: infer P } }
	? P
	: unknown;

export interface DialogNav<Params = unknown> {
	dialog: DialogManager;
	switchTo(state: string, mode?: ShowMode): Promise<void>;
	back(mode?: ShowMode): Promise<void>;
	next(mode?: ShowMode): Promise<void>;
	done(result?: unknown, mode?: ShowMode): Promise<void>;
	start(
		dialog: DialogRef,
		state?: string,
		options?: StartOptions,
	): Promise<void>;
	show(mode?: ShowMode): Promise<void>;
	widgetData<T = unknown>(id: string, fallback: T): T;
	/** Mutable per-dialog data (aiogram_dialog `dialog_data`). */
	readonly dialogData: DataDict;
	/** Immutable params passed to `start()` (aiogram_dialog `start_data`). */
	readonly params: Params;
}

/**
 * Context handed to widget `onClick` / `onMessage` handlers — the raw gramio
 * context augmented with the dialog navigation surface ({@link DialogNav}).
 */
export type ClickCtx<Params = unknown> = CallbackCtx & DialogNav<Params>;
export type InputCtx<Params = unknown> = MessageCtx & DialogNav<Params>;

/** How `start()` should treat the existing dialog stack. */
export enum StartMode {
	/** Push the new dialog on top of the current stack (default). */
	Normal = "normal",
	/** Clear the current stack first, so the new dialog is the only one. */
	ResetStack = "reset",
	/** Open in a fresh, independent stack (the old one stays alive in parallel). */
	NewStack = "new",
}

/** How `show()` should deliver the rendered window. */
export enum ShowMode {
	/** Decide automatically: edit on callback, send on message. */
	Auto = "auto",
	/** Always send a new message. */
	Send = "send",
	/** Always edit the last message. */
	Edit = "edit",
	/** Delete the last message and send a new one (needed for media↔text switches). */
	Delete = "delete",
}

/** Button color style (Bot API `KeyboardButtonStyle`). */
export type ButtonStyle = "danger" | "success" | "primary";

/**
 * A reply-keyboard request button (users / chat / contact / location). These
 * render only in `reply: true` windows; the result arrives as a service message.
 */
export interface ReplyRequest {
	kind: "users" | "chat" | "contact" | "location";
	/** Non-zero id echoed back in the `users_shared` / `chat_shared` result. */
	requestId?: number;
	/** Extra Bot API options for the request button (`user_is_bot`, `chat_is_channel`, …). */
	options?: Record<string, unknown>;
}

/** A single rendered inline button before intent-id packing. */
export interface RawButton {
	text: string;
	/** Internal dialog callback target. Mutually exclusive with `url`/`webApp`. */
	cb?: { widgetId: string; payload?: string };
	/** Opens a URL (no callback). */
	url?: string;
	/** Opens a Web App by URL (no callback). */
	webApp?: string;
	/** Switch-inline-query button (no callback). */
	switchInline?: { query: string; currentChat?: boolean };
	/** Reply-keyboard request button (reply windows only; no callback). */
	request?: ReplyRequest;
	/** `custom_emoji_id` shown as the button's icon (needs an eligible bot). */
	iconEmojiId?: string;
	/** Button color. */
	style?: ButtonStyle;
}

/**
 * Data passed to every widget's render method.
 *
 * Generic over the window's getter output: widgets used inside a typed
 * `Window<Data>` see `data: Data` (defaults to the loose {@link DataDict}).
 */
export interface RenderContext<Data extends DataDict = DataDict> {
	/** Merged getter output (+ `dialogData`, `startData`). */
	data: Data;
	manager: DialogManager;
}

export interface TextWidget<Data extends DataDict = DataDict> {
	renderText(ctx: RenderContext<Data>): MaybePromise<Stringable>;
}

/**
 * Anything accepted where text is expected: a bare string, a `(data) => …`
 * function, or a {@link TextWidget}. Normalised by `asText`.
 */
export type TextSource<Data extends DataDict = DataDict> =
	| string
	| TextWidget<Data>
	| ((data: Data, ctx: RenderContext<Data>) => Stringable);

export interface MediaWidget<Data extends DataDict = DataDict> {
	renderMedia(
		ctx: RenderContext<Data>,
	): MaybePromise<RenderedMedia | undefined>;
}

export type MediaType = "photo" | "video" | "animation" | "document" | "audio";

export interface RenderedMedia {
	type: MediaType;
	/**
	 * file_id / HTTP URL (string), or an uploadable `Blob`/`File` (e.g. a
	 * generated image from `MediaUpload.buffer(...)`, as used by `QR`/`Barcode`).
	 */
	media: string | Blob;
}

export interface Keyboard<Data extends DataDict = DataDict> {
	renderKeyboard(ctx: RenderContext<Data>): MaybePromise<RawButton[][]>;
	/**
	 * Try to handle a callback routed by widgetId.
	 * @returns `true` if this widget (or a descendant) handled it.
	 */
	processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): MaybePromise<boolean>;
}

export type WhenCondition<Data extends DataDict = DataDict> =
	| boolean
	| ((ctx: RenderContext<Data>) => boolean);

/** A widget that consumes free-text input while its window is shown. */
export interface InputWidget {
	/** @returns `true` if it handled the message. */
	processInput(ctx: InputCtx): MaybePromise<boolean>;
}

/**
 * The raw gramio update augmented with the live {@link DialogManager}. This is
 * what getters, lifecycle hooks, and the access validator receive.
 */
export type DialogEventCtx = DialogUpdateCtx & { dialog: DialogManager };

/** A getter loads data for a window/dialog before rendering. */
export type Getter<Data extends DataDict = DataDict> = (
	ctx: DialogEventCtx,
) => MaybePromise<Data>;

/**
 * Guards who may interact with a dialog. Runs on every incoming callback/message
 * routed into the active dialog (mirrors aiogram_dialog's access validator).
 * Return `false` to reject the interaction. Not consulted by `start()` — that is
 * the caller's own decision.
 */
export type AccessCheck = (ctx: DialogEventCtx) => MaybePromise<boolean>;

/** Called when {@link AccessCheck} rejects a callback interaction. */
export type AccessDeniedHandler = (
	ctx: DialogEventCtx,
) => MaybePromise<unknown>;

/**
 * Global, overridable hooks for the engine's built-in answers. Every hook is
 * optional; when omitted the engine stays **silent** (a bare `ctx.answer()` to
 * close the loading spinner — no hard-coded text). Wire them in
 * `dialogs(list, { events: { … } })` to localise / log / alert as you like.
 */
export interface DialogEvents {
	/**
	 * A tap on a button from a stale / already-closed dialog instance (its
	 * `intentId` no longer matches the active stack). Default: silent answer.
	 */
	onStale?: (ctx: DialogEventCtx) => MaybePromise<unknown>;
	/**
	 * Global fallback when an {@link AccessCheck} rejects an interaction and the
	 * dialog has no own {@link AccessDeniedHandler}. Default: silent answer.
	 */
	onAccessDenied?: AccessDeniedHandler;
}

/**
 * Resolves a translation key to text. A `@gramio/i18n` `ctx.t` satisfies this,
 * but any `(key, params?) => string` function works.
 */
export type Translator = (
	key: string,
	params?: Record<string, unknown>,
) => Stringable;

/** Derives a {@link Translator} from the incoming update (per-user locale, …). */
export type I18nResolver = (ctx: DialogUpdateCtx) => Translator;
