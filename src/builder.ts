import type {
	AnyData,
	Getter,
	RenderContext,
	RenderData,
	Stringable,
	TextWidget,
	WhenCondition,
} from "./types.ts";
import { Format } from "./widgets/text.ts";

export interface WindowTyping<Data extends AnyData> {
	/** Identity wrapper that pins a getter to `Data` (so `text`/`when` infer it). */
	getter(fn: Getter<Data>): Getter<Data>;
	/** Typed dynamic text — `data` is your `Data` (plus the injected `dialogData`). */
	text(
		fn: (data: RenderData<Data>, rc: RenderContext<Data>) => Stringable,
	): TextWidget<Data>;
	/** Typed `when` condition — `rc.data` is your `Data`. */
	when(fn: (rc: RenderContext<Data>) => boolean): WhenCondition<Data>;
}

/**
 * Declare a window's data shape once and get typed `getter` / `text` / `when`
 * helpers — the gramio/scenes/views way, without relying on cross-property
 * inference.
 *
 * @example
 * ```ts
 * const v = defineWindow<{ user: { name: string }; count: number }>();
 * new Window({
 *   state: "home",
 *   getter: v.getter((ctx) => ({ user: { name: ctx.from!.firstName }, count: 3 })),
 *   text: v.text((d) => `Hi ${d.user.name} — ${d.count}`), // d is fully typed
 *   keyboard: Column([
 *     Button({ text: v.text((d) => `count: ${d.count}`), id: "x" }),
 *   ]),
 * });
 * ```
 */
export function defineWindow<Data extends AnyData>(): WindowTyping<Data> {
	return {
		getter: (fn) => fn,
		text: (fn) => Format<Data>(fn),
		when: (fn) => fn,
	};
}
