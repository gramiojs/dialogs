import type { DialogManager } from "./manager.ts";
import type {
	AccessCheck,
	AccessDeniedHandler,
	AnyData,
	DataDict,
	DialogNav,
	DialogUpdateCtx,
	Getter,
	Keyboard,
	MaybePromise,
	MediaWidget,
	MessageCtx,
	TextSource,
} from "./types.ts";
import { Window, type WindowOptions } from "./window.ts";

export interface DialogOptions {
	/** Unique id of this dialog — also the "state group" id. */
	id: string;
	/** Windows declared up-front (alternative to the `.window()` builder). */
	windows?: Window<AnyData>[];
	/** Dialog-level getter, merged under each window's getter. */
	getter?: Getter;
	/** Called after the dialog is pushed onto the stack. */
	onStart?: (ctx: DialogManager, startData: unknown) => MaybePromise<unknown>;
	/** Called when the dialog is popped (via `done`). */
	onClose?: (ctx: DialogManager, result: unknown) => MaybePromise<unknown>;
	/** Called on the parent dialog when a child closes with a result. */
	onProcessResult?: (
		ctx: DialogManager,
		startData: unknown,
		result: unknown,
	) => MaybePromise<unknown>;
	/**
	 * Guards who may interact with this dialog. Runs on every callback/message
	 * routed into the active window; return `false` to reject. Rejected callbacks
	 * are answered (or routed to {@link DialogOptions.onAccessDenied}); rejected
	 * messages are silently ignored. Not consulted by `start()`.
	 */
	access?: AccessCheck;
	/** Custom reaction when {@link DialogOptions.access} rejects a callback. */
	onAccessDenied?: AccessDeniedHandler;
}

export type DialogConfig = Omit<DialogOptions, "id" | "windows">;

/**
 * Per-window options for the `.window()` builder.
 *
 * `Data` is inferred **solely from `getter`** (the render fields use
 * `NoInfer<Data>`), so `text` / `keyboard` get the getter's type regardless of
 * property order, and an untyped `Column(...)` doesn't widen `Data` back to
 * `DataDict`.
 */
export interface BuilderWindow<Data extends AnyData, Params> {
	text?: TextSource<NoInfer<Data>>;
	keyboard?: Keyboard<NoInfer<Data>>;
	media?: MediaWidget<NoInfer<Data>>;
	getter?: (ctx: DialogUpdateCtx & DialogNav<Params>) => MaybePromise<Data>;
	input?: WindowOptions<Data>["input"];
	onMessage?: (ctx: MessageCtx & DialogNav<Params>) => MaybePromise<unknown>;
	disableWebPreview?: boolean;
	reply?: boolean;
}

/**
 * A container of {@link Window}s sharing one state group.
 *
 * Two construction styles:
 *  - `new Dialog({ id, windows: [...] })` — declare windows up-front.
 *  - `new Dialog<Params>("id").window("state", {...})` — incremental builder
 *    where `ctx.params` is typed as `Params` and `Data` is inferred per window.
 */
export class Dialog<Params = unknown> {
	readonly id: string;
	readonly getter?: Getter;
	readonly onStart?: DialogOptions["onStart"];
	readonly onClose?: DialogOptions["onClose"];
	readonly onProcessResult?: DialogOptions["onProcessResult"];
	readonly access?: AccessCheck;
	readonly onAccessDenied?: AccessDeniedHandler;

	private readonly windows = new Map<string, Window<AnyData>>();
	private readonly order: string[] = [];

	constructor(options: DialogOptions);
	constructor(id: string, config?: DialogConfig);
	constructor(a: DialogOptions | string, config: DialogConfig = {}) {
		const options: DialogOptions =
			typeof a === "string" ? { id: a, ...config } : a;
		this.id = options.id;
		this.getter = options.getter;
		this.onStart = options.onStart;
		this.onClose = options.onClose;
		this.onProcessResult = options.onProcessResult;
		this.access = options.access;
		this.onAccessDenied = options.onAccessDenied;
		for (const window of options.windows ?? []) this.add(window);
	}

	private add(window: Window<AnyData>): void {
		if (this.windows.has(window.state))
			throw new Error(
				`Dialog "${this.id}" has duplicate window state "${window.state}"`,
			);
		this.windows.set(window.state, window);
		this.order.push(window.state);
	}

	/** Incrementally declare a window. `Data` is inferred from `getter`. Chainable. */
	window<Data extends AnyData = DataDict>(
		state: string,
		options: BuilderWindow<Data, Params> = {},
	): this {
		// Builder ctx is a superset of the stored Getter ctx (runtime attaches the
		// whole nav surface), so the cast to WindowOptions is safe.
		this.add(
			new Window<Data>({ state, ...options } as unknown as WindowOptions<Data>),
		);
		return this;
	}

	get firstState(): string {
		const first = this.order[0];
		if (first === undefined)
			throw new Error(`Dialog "${this.id}" has no windows`);
		return first;
	}

	getWindow(state: string): Window<AnyData> {
		const window = this.windows.get(state);
		if (!window)
			throw new Error(`Dialog "${this.id}" has no window for state "${state}"`);
		return window;
	}

	/** Adjacent state for `next()` navigation. */
	siblingState(state: string, delta: 1 | -1): string | undefined {
		const index = this.order.indexOf(state);
		if (index === -1) return undefined;
		return this.order[index + delta];
	}
}
