import type { DialogManager } from "../manager.ts";
import { ShowMode, type StartMode } from "../types.ts";
import type {
	ButtonStyle,
	ClickCtx,
	DialogRef,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	StartParamsOf,
	StatesOf,
	TextSource,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";
import { asText } from "./text.ts";

export type OnClick = (ctx: ClickCtx) => MaybePromise<unknown>;

/** Visual options shared by every button widget. */
export interface ButtonChrome {
	/** `custom_emoji_id` shown as the button icon (e.g. `iconId("search")`). */
	icon?: string;
	/**
	 * Button color: `"danger"` | `"success"` | `"primary"`.
	 * Accepts a static value or a function computed from render data.
	 */
	style?: ButtonStyle | ((rc: RenderContext) => ButtonStyle);
	when?: WhenCondition;
}

interface Chrome {
	icon?: string;
	style?: ButtonStyle | ((rc: RenderContext) => ButtonStyle);
}
const chrome = (o: ButtonChrome): Chrome => ({ icon: o.icon, style: o.style });

function resolveStyle(
	style: ButtonStyle | ((rc: RenderContext) => ButtonStyle) | undefined,
	rc: RenderContext,
): ButtonStyle | undefined {
	return typeof style === "function" ? style(rc) : style;
}

/** A `TextSource` (label), or a full options object — used to support positional + options call forms. */
function isLabel(value: unknown): value is TextSource {
	return (
		typeof value === "string" ||
		typeof value === "function" ||
		(typeof value === "object" && value !== null && "renderText" in value)
	);
}

// ───────────────────────── Button ─────────────────────────

export interface ButtonOptions extends ButtonChrome {
	text: TextSource;
	id: string;
	onClick?: OnClick;
}

/** A single inline button that fires `onClick`. */
class ButtonWidget extends KeyboardWidget {
	private readonly text: TextWidget;
	constructor(
		text: TextSource,
		private readonly id: string,
		private readonly onClick?: OnClick,
		when?: WhenCondition,
		private readonly extra: Chrome = {},
	) {
		super(when);
		this.text = asText(text);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		// Inline-button labels are plain text (no entities), so coerce to string.
		return [
			[
				{
					text: String(await this.text.renderText(rc)),
					cb: { widgetId: this.id },
					iconEmojiId: this.extra.icon,
					style: resolveStyle(this.extra.style, rc),
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		_payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.id) return false;
		await this.onClick?.(manager.clickCtx);
		return true;
	}
}

export function Button(options: ButtonOptions): Keyboard;
export function Button(
	text: TextSource,
	options: Omit<ButtonOptions, "text">,
): Keyboard;
export function Button(
	a: ButtonOptions | TextSource,
	b?: Omit<ButtonOptions, "text">,
): Keyboard {
	const o: ButtonOptions = isLabel(a)
		? { text: a, ...(b as Omit<ButtonOptions, "text">) }
		: a;
	return new ButtonWidget(o.text, o.id, o.onClick, o.when, chrome(o));
}

// ───────────────────────── navigation buttons ─────────────────────────

let navCounter = 0;
function autoId(prefix: string): string {
	return `${prefix}${navCounter++}`;
}

/** Compose a user `onClick` (run first) with a built-in navigation action. */
function withAction(user: OnClick | undefined, action: OnClick): OnClick {
	return async (ctx) => {
		await user?.(ctx);
		await action(ctx);
	};
}

export interface SwitchToOptions extends ButtonChrome {
	text: TextSource;
	state: string;
	id?: string;
	onClick?: OnClick;
	mode?: ShowMode;
}
type SwitchToExtra = Omit<SwitchToOptions, "text" | "state">;

/** Switch to another window within the current dialog. */
export function SwitchTo(options: SwitchToOptions): Keyboard;
export function SwitchTo(
	text: TextSource,
	state: string,
	options?: SwitchToExtra,
): Keyboard;
export function SwitchTo(
	a: SwitchToOptions | TextSource,
	state?: string,
	extra: SwitchToExtra = {},
): Keyboard {
	const o: SwitchToOptions = isLabel(a)
		? { text: a, state: state as string, ...extra }
		: a;
	return new ButtonWidget(
		o.text,
		o.id ?? autoId("switch_"),
		withAction(o.onClick, (ctx) =>
			ctx.dialog.switchTo(o.state, o.mode ?? ShowMode.Auto),
		),
		o.when,
		chrome(o),
	);
}

export interface StepOptions extends ButtonChrome {
	text?: TextSource;
	id?: string;
	onClick?: OnClick;
	mode?: ShowMode;
}
type StepExtra = Omit<StepOptions, "text">;

function stepWidget(
	prefix: string,
	fallback: string,
	action: (ctx: ClickCtx, mode: ShowMode) => unknown,
) {
	return (a?: StepOptions | TextSource, extra: StepExtra = {}): Keyboard => {
		const o: StepOptions =
			a === undefined ? {} : isLabel(a) ? { text: a, ...extra } : a;
		return new ButtonWidget(
			o.text ?? fallback,
			o.id ?? autoId(prefix),
			withAction(o.onClick, (ctx) => action(ctx, o.mode ?? ShowMode.Auto)),
			o.when,
			chrome(o),
		);
	};
}

/** Go to the previous window (history-based). */
export function Back(options?: StepOptions): Keyboard;
export function Back(text?: TextSource, options?: StepExtra): Keyboard;
export function Back(a?: StepOptions | TextSource, b?: StepExtra): Keyboard {
	return stepWidget("back_", "◀", (ctx, mode) => ctx.dialog.back(mode))(a, b);
}

/** Move to the next window in declaration order. */
export function Next(options?: StepOptions): Keyboard;
export function Next(text?: TextSource, options?: StepExtra): Keyboard;
export function Next(a?: StepOptions | TextSource, b?: StepExtra): Keyboard {
	return stepWidget("next_", "▶", (ctx, mode) => ctx.dialog.next(mode))(a, b);
}

export interface CancelOptions extends ButtonChrome {
	text?: TextSource;
	id?: string;
	result?: unknown;
	onClick?: OnClick;
	mode?: ShowMode;
}
type CancelExtra = Omit<CancelOptions, "text">;

/** Close the current dialog (pop the stack), optionally returning a result. */
export function Cancel(options?: CancelOptions): Keyboard;
export function Cancel(text?: TextSource, options?: CancelExtra): Keyboard;
export function Cancel(
	a?: CancelOptions | TextSource,
	b?: CancelExtra,
): Keyboard {
	const o: CancelOptions =
		a === undefined ? {} : isLabel(a) ? { text: a, ...b } : a;
	return new ButtonWidget(
		o.text ?? "✖",
		o.id ?? autoId("cancel_"),
		withAction(o.onClick, (ctx) =>
			ctx.dialog.done(o.result, o.mode ?? ShowMode.Auto),
		),
		o.when,
		chrome(o),
	);
}

export interface StartOptions extends ButtonChrome {
	text: TextSource;
	/** Target dialog — its string id, or the {@link Dialog} object (typo-safe). */
	dialogId: DialogRef;
	state?: string;
	data?: unknown;
	id?: string;
	onClick?: OnClick;
	mode?: ShowMode;
	startMode?: StartMode;
}
type StartExtra = Omit<StartOptions, "text" | "dialogId">;

/**
 * Start another dialog on top of the current one. Pass a `TypedDialog` (from
 * `defineDialog().build()`) as the target to type-check `state` and `data`.
 */
export function Start(options: StartOptions): Keyboard;
export function Start<Ref extends DialogRef>(
	text: TextSource,
	dialogId: Ref,
	options?: Omit<StartExtra, "state" | "data"> & {
		state?: StatesOf<Ref>;
		data?: StartParamsOf<Ref>;
	},
): Keyboard;
export function Start(
	a: StartOptions | TextSource,
	dialogId?: DialogRef,
	extra: StartExtra = {},
): Keyboard {
	const o: StartOptions = isLabel(a)
		? { text: a, dialogId: dialogId as DialogRef, ...extra }
		: a;
	return new ButtonWidget(
		o.text,
		o.id ?? autoId("start_"),
		withAction(o.onClick, (ctx) =>
			ctx.dialog.start(o.dialogId, o.state, {
				data: o.data,
				mode: o.mode ?? ShowMode.Auto,
				startMode: o.startMode,
			}),
		),
		o.when,
		chrome(o),
	);
}

// ───────────────────────── link buttons (no callback) ─────────────────────────

class LinkWidget extends KeyboardWidget {
	private readonly text: TextWidget;
	constructor(
		text: TextSource,
		private readonly kind: "url" | "webApp",
		private readonly target: string | ((rc: RenderContext) => string),
		when?: WhenCondition,
		private readonly extra: Chrome = {},
	) {
		super(when);
		this.text = asText(text);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const value =
			typeof this.target === "function" ? this.target(rc) : this.target;
		const text = String(await this.text.renderText(rc));
		const base = {
			text,
			iconEmojiId: this.extra.icon,
			style: resolveStyle(this.extra.style, rc),
		};
		return [
			[
				this.kind === "url"
					? { ...base, url: value }
					: { ...base, webApp: value },
			],
		];
	}

	processCallback(): boolean {
		return false; // link buttons never produce callbacks
	}
}

export interface LinkOptions extends ButtonChrome {
	text: TextSource;
	/** Static URL or one computed from render data. */
	url: string | ((rc: RenderContext) => string);
}
type LinkExtra = Omit<LinkOptions, "text" | "url">;

/** An inline button that opens a URL. */
export function Url(options: LinkOptions): Keyboard;
export function Url(
	text: TextSource,
	url: LinkOptions["url"],
	options?: LinkExtra,
): Keyboard;
export function Url(
	a: LinkOptions | TextSource,
	url?: LinkOptions["url"],
	extra: LinkExtra = {},
): Keyboard {
	const o: LinkOptions = isLabel(a)
		? { text: a, url: url as LinkOptions["url"], ...extra }
		: a;
	return new LinkWidget(o.text, "url", o.url, o.when, chrome(o));
}

export interface WebAppOptions extends ButtonChrome {
	text: TextSource;
	/** HTTPS URL of the Web App. */
	url: string | ((rc: RenderContext) => string);
}

/** An inline button that launches a Telegram Web App. */
export function WebApp(options: WebAppOptions): Keyboard;
export function WebApp(
	text: TextSource,
	url: WebAppOptions["url"],
	options?: LinkExtra,
): Keyboard;
export function WebApp(
	a: WebAppOptions | TextSource,
	url?: WebAppOptions["url"],
	extra: LinkExtra = {},
): Keyboard {
	const o: WebAppOptions = isLabel(a)
		? { text: a, url: url as WebAppOptions["url"], ...extra }
		: a;
	return new LinkWidget(o.text, "webApp", o.url, o.when, chrome(o));
}

class SwitchInlineWidget extends KeyboardWidget {
	private readonly text: TextWidget;
	constructor(
		text: TextSource,
		private readonly query: string | ((rc: RenderContext) => string),
		private readonly currentChat: boolean,
		when?: WhenCondition,
		private readonly extra: Chrome = {},
	) {
		super(when);
		this.text = asText(text);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const query =
			typeof this.query === "function" ? this.query(rc) : this.query;
		return [
			[
				{
					text: String(await this.text.renderText(rc)),
					switchInline: { query, currentChat: this.currentChat },
					iconEmojiId: this.extra.icon,
					style: resolveStyle(this.extra.style, rc),
				},
			],
		];
	}

	processCallback(): boolean {
		return false;
	}
}

export interface SwitchInlineOptions extends ButtonChrome {
	text: TextSource;
	/** Inline query to prefill (static or computed from data). */
	query: string | ((rc: RenderContext) => string);
	/** Insert into the current chat instead of opening the chat picker. */
	currentChat?: boolean;
}

/** A button that switches to inline mode (chat picker or current chat). */
export function SwitchInlineQuery(options: SwitchInlineOptions): Keyboard {
	return new SwitchInlineWidget(
		options.text,
		options.query,
		options.currentChat ?? false,
		options.when,
		chrome(options),
	);
}
