import { type BuilderWindow, Dialog, type DialogConfig } from "./dialog.ts";
import type { DialogManager } from "./manager.ts";
import type {
	AnyData,
	CallbackCtx,
	DataDict,
	DialogEventCtx,
	DialogNav,
	DialogRef,
	DialogUpdateCtx,
	Keyboard,
	MaybePromise,
	MediaWidget,
	MessageCtx,
	ShowMode,
	StartParamsOf,
	StatesOf,
	TextSource,
} from "./types.ts";
import {
	Back,
	Button,
	type ButtonChrome,
	Cancel,
	type CancelOptions,
	Next,
	type OnClick,
	Start,
	type StartOptions as StartButtonOptions,
	type StepOptions,
	SwitchTo,
	type SwitchToOptions,
} from "./widgets/button.ts";
import type { WindowOptions } from "./window.ts";

/**
 * A {@link Dialog} that **carries its typed states / params / data** — the
 * result of {@link DialogBuilder.build}. Passing one to `Start(...)` /
 * `wb.start(...)` / `ctx.start(...)` type-checks the target `state` and `data`,
 * so cross-dialog transitions are compile-time safe. The `__types` field is a
 * phantom (never present at runtime).
 */
export type TypedDialog<
	State extends string = string,
	Params = unknown,
	Data extends AnyData = DataDict,
> = Dialog<Params> & {
	readonly __types?: { state: State; params: Params; data: Data };
};

/**
 * The dialog navigation surface narrowed to a dialog's own declared states and
 * typed `dialogData` / `params`. `switchTo` only accepts states declared via
 * {@link DialogBuilder.states}; `dialogData` is typed as the dialog's `Data`.
 */
export interface TypedNav<State extends string, Params, Data extends AnyData>
	extends Omit<DialogNav<Params>, "switchTo" | "dialogData"> {
	switchTo(
		state: State,
		modeOrOptions?: ShowMode | { data?: Partial<Data>; mode?: ShowMode },
	): Promise<void>;
	readonly dialogData: Data;
}

export type TypedEventCtx<
	State extends string,
	Params,
	Data extends AnyData,
> = DialogUpdateCtx & TypedNav<State, Params, Data>;

export type TypedClickCtx<
	State extends string,
	Params,
	Data extends AnyData,
> = CallbackCtx & TypedNav<State, Params, Data>;

export type TypedInputCtx<
	State extends string,
	Params,
	Data extends AnyData,
> = MessageCtx & TypedNav<State, Params, Data>;

/**
 * Per-window options for {@link DialogBuilder.window}. `WData` is inferred solely
 * from `getter` (render fields use `NoInfer`), while handler contexts are typed
 * with the dialog's `State` / `Params` / `Data`.
 */
export interface TypedWindowOptions<
	WData extends AnyData,
	State extends string,
	Params,
	Data extends AnyData,
> {
	text?: TextSource<NoInfer<WData>>;
	keyboard?: Keyboard<NoInfer<WData>>;
	media?: MediaWidget<NoInfer<WData>>;
	getter?: (ctx: TypedEventCtx<State, Params, Data>) => MaybePromise<WData>;
	input?: WindowOptions<WData>["input"];
	onMessage?: (
		ctx: TypedInputCtx<State, Params, Data>,
	) => MaybePromise<unknown>;
	disableWebPreview?: boolean;
	reply?: boolean;
}

/** Button options with an `onClick` typed to the dialog's state/params/data. */
export interface TypedButtonOptions<
	State extends string,
	Params,
	Data extends AnyData,
> extends ButtonChrome {
	id: string;
	onClick?: (ctx: TypedClickCtx<State, Params, Data>) => MaybePromise<unknown>;
}

/** Dialog-level config with lifecycle `startData` typed as the dialog's `Params`. */
export interface TypedDialogConfig<Params>
	extends Omit<DialogConfig, "onStart" | "onProcessResult"> {
	onStart?: (ctx: DialogManager, startData: Params) => MaybePromise<unknown>;
	onProcessResult?: (
		ctx: DialogManager,
		startData: Params,
		result: unknown,
	) => MaybePromise<unknown>;
}

interface WindowSpec {
	state: string;
	options: BuilderWindow<DataDict, unknown>;
}

/**
 * Fluent, fully-typed dialog builder (Phase 3 typing) — the scenes-level way to
 * get **typed states** and **typed `dialogData` / `params`**:
 *
 *  - {@link DialogBuilder.states} declares the state union up-front, so
 *    {@link DialogBuilder.switchTo} / `.window(...)` only accept valid states
 *    (typos are compile errors, including forward references).
 *  - {@link DialogBuilder.data} / {@link DialogBuilder.params} type the mutable
 *    `dialogData` and immutable `params` that flow into getters and handlers.
 *
 * Construction is deferred until {@link DialogBuilder.build}; the result is a
 * plain {@link Dialog}, fully compatible with the engine.
 *
 * @example
 * ```ts
 * const wb = defineDialog("wizard")
 *   .states("name", "confirm")
 *   .params<{ chatId: number }>()
 *   .data<{ score: number }>();
 *
 * wb.window("name", {
 *   getter: (ctx) => ({ name: ctx.from?.firstName ?? "?" }), // ctx.params: {chatId}
 *   text: (d) => `Hi ${d.name}`,
 *   keyboard: Column([wb.switchTo("Next ▶", "confirm")]),     // "confirm" ✓, "typo" ✗
 * });
 * wb.window("confirm", { text: "Done", keyboard: Column([wb.cancel("Close")]) });
 *
 * const wizard = wb.build();    // → Dialog, register via dialogs([wizard])
 * ```
 */
export class DialogBuilder<State extends string, Params, Data extends AnyData> {
	private readonly declared = new Set<string>();
	private readonly specs: WindowSpec[] = [];

	constructor(
		private readonly id: string,
		private cfg: TypedDialogConfig<Params> = {},
	) {}

	/** Declare the dialog's state union up-front (enables typed navigation). */
	states<const S extends readonly string[]>(
		...names: S
	): DialogBuilder<S[number], Params, Data> {
		for (const name of names) this.declared.add(name);
		return this as unknown as DialogBuilder<S[number], Params, Data>;
	}

	/** Type the immutable `params` passed to `start()` for this dialog. */
	params<P>(): DialogBuilder<State, P, Data> {
		return this as unknown as DialogBuilder<State, P, Data>;
	}

	/** Type the mutable `dialogData` for this dialog. */
	data<D extends AnyData>(): DialogBuilder<State, Params, D> {
		return this as unknown as DialogBuilder<State, Params, D>;
	}

	/** Set or merge dialog-level config (getter, lifecycle, access, …). */
	config(config: TypedDialogConfig<Params>): this {
		this.cfg = { ...this.cfg, ...config };
		return this;
	}

	/** Declare a window. `state` is constrained to the declared states. */
	window<WData extends AnyData = DataDict>(
		state: State,
		options: TypedWindowOptions<WData, State, Params, Data> = {},
	): this {
		if (this.declared.size > 0 && !this.declared.has(state))
			throw new Error(
				`Dialog "${this.id}" window "${state}" was not declared in .states()`,
			);
		this.specs.push({
			state,
			options: options as unknown as BuilderWindow<DataDict, unknown>,
		});
		return this;
	}

	// ───────────────────────── typed navigation helpers ─────────────────────────

	/** A {@link SwitchTo} button whose target `state` is checked against the dialog. */
	switchTo(
		text: TextSource,
		state: State,
		options?: Omit<SwitchToOptions, "text" | "state">,
	): Keyboard {
		return SwitchTo(text, state, options);
	}

	/** A {@link Next} button (next window in declaration order). */
	next(text?: TextSource, options?: Omit<StepOptions, "text">): Keyboard {
		return Next(text, options);
	}

	/** A {@link Back} button (history-based). */
	back(text?: TextSource, options?: Omit<StepOptions, "text">): Keyboard {
		return Back(text, options);
	}

	/** A {@link Cancel} button (closes this dialog). */
	cancel(text?: TextSource, options?: Omit<CancelOptions, "text">): Keyboard {
		return Cancel(text, options);
	}

	/**
	 * A {@link Start} button opening another dialog. Pass a {@link TypedDialog}
	 * (from `.build()`) as the target to type-check its `state` and `data`.
	 */
	start<Ref extends DialogRef>(
		text: TextSource,
		target: Ref,
		options?: Omit<
			StartButtonOptions,
			"text" | "dialogId" | "state" | "data"
		> & {
			state?: StatesOf<Ref>;
			data?: StartParamsOf<Ref>;
		},
	): Keyboard {
		return Start(text, target, options);
	}

	/** A {@link Button} whose `onClick` ctx is typed (`switchTo`, `dialogData`, …). */
	button(
		text: TextSource,
		options: TypedButtonOptions<State, Params, Data>,
	): Keyboard {
		return Button(text, {
			...options,
			onClick: options.onClick as OnClick | undefined,
		});
	}

	/**
	 * Wrap any handler context in a navigation surface **typed to this dialog** —
	 * `switchTo` then only accepts declared states (typos become compile errors,
	 * not runtime throws), and `dialogData` / `params` are typed. Use it inside
	 * raw widget handlers where the plain `ctx.switchTo` is stringly-typed:
	 *
	 * @example
	 * ```ts
	 * Button("Go", { id: "go", onClick: (ctx) => wb.nav(ctx).switchTo("settings") })
	 * //                                                            ^ "settings" ✓, "typo" ✗
	 * ```
	 */
	nav(ctx: DialogEventCtx): TypedNav<State, Params, Data> {
		// The runtime ctx already carries the full nav surface (manager attaches
		// switchTo/back/…); this only narrows its type to the dialog's states.
		return ctx as unknown as TypedNav<State, Params, Data>;
	}

	/** Materialise the accumulated spec into a {@link TypedDialog} (a `Dialog`
	 * carrying its `State` / `Params` / `Data` for typed cross-dialog navigation). */
	build(): TypedDialog<State, Params, Data> {
		const dialog = new Dialog<Params>(this.id, this.cfg as DialogConfig);
		for (const spec of this.specs)
			dialog.window(
				spec.state,
				spec.options as BuilderWindow<DataDict, Params>,
			);
		return dialog as TypedDialog<State, Params, Data>;
	}
}

/**
 * Start a fully-typed dialog builder (Phase 3 typing). Chain
 * `.states(...)` / `.params<P>()` / `.data<D>()` / `.config(...)` then declare
 * windows with `.window(...)`, and finish with `.build()`. See
 * {@link DialogBuilder}.
 */
export function defineDialog(
	id: string,
	config?: TypedDialogConfig<unknown>,
): DialogBuilder<never, unknown, DataDict> {
	return new DialogBuilder(id, config);
}
