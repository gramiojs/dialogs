import type {
	AnyData,
	DataDict,
	MaybePromise,
	RenderContext,
	RenderData,
	Stringable,
	TextSource,
	TextWidget,
} from "../types.ts";

/** Static text. Accepts a plain string or a `FormattableString`. */
export function Const(text: Stringable): TextWidget {
	return { renderText: () => text };
}

/**
 * Normalise any {@link TextSource} (bare string, `(data) => …` fn, or
 * {@link TextWidget}) into a `TextWidget`. Lets every widget accept text the
 * concise way — `text: "Hello"` or `text: (d) => d.name` — without `Const`/`Format`.
 */
export function asText<Data extends AnyData = DataDict>(
	src: TextSource<Data>,
): TextWidget<Data> {
	if (typeof src === "string") return { renderText: () => src };
	if (typeof src === "function")
		return { renderText: (rc) => src(rc.data, rc) };
	return src;
}

/**
 * Dynamic text — generic over the window's `Data`.
 *
 * - Pass a function `(data, rc) => Stringable` for full control (return a
 *   `FormattableString` from `@gramio/format` to use entities). `data` is typed
 *   when used in a `Window<Data>` or via `defineWindow<Data>().text(...)`.
 * - Pass a template string with `{key}` placeholders interpolated from `data`.
 */
export function Format<Data extends AnyData = DataDict>(
	template:
		| string
		| ((data: RenderData<Data>, rc: RenderContext<Data>) => Stringable),
): TextWidget<Data> {
	if (typeof template === "function")
		return { renderText: (rc) => template(rc.data, rc) };

	return {
		renderText: (rc) =>
			template.replace(/\{(\w+)\}/g, (_, key: string) => {
				const value = rc.data[key];
				return value === undefined ? "" : String(value);
			}),
	};
}

/**
 * i18n text — resolves a translation `key` through the configured translator
 * (see `dialogs(list, { i18n })`; falls back to a `ctx.t` on the update, then to
 * echoing the key). `params` may be static or computed from render data.
 *
 * @example
 * ```ts
 * // dialogs(list, { i18n: (ctx) => ctx.t })  // wire @gramio/i18n
 * text: T("menu.greeting", (d) => ({ name: d.user.name })),
 * ```
 */
export function T<Data extends AnyData = DataDict>(
	key: string,
	params?:
		| Record<string, unknown>
		| ((
				data: RenderData<Data>,
				rc: RenderContext<Data>,
		  ) => Record<string, unknown>),
): TextWidget<Data> {
	return {
		renderText: (rc) => {
			const resolved =
				typeof params === "function" ? params(rc.data, rc) : params;
			return rc.manager.t(key, resolved);
		},
	};
}

/**
 * A progress bar (aiogram_dialog `Progress`). `value` reads a 0–100 percentage
 * from data; renders `filled`×n + `empty`×(width−n).
 */
export function Progress(options: {
	value: (data: DataDict) => number;
	width?: number;
	filled?: string;
	empty?: string;
}): TextWidget {
	const width = options.width ?? 10;
	const filled = options.filled ?? "█";
	const empty = options.empty ?? "░";
	return {
		renderText: (rc) => {
			const pct = Math.max(0, Math.min(100, options.value(rc.data)));
			const n = Math.round((pct / 100) * width);
			return filled.repeat(n) + empty.repeat(width - n);
		},
	};
}

/** Concatenate several text widgets (aiogram_dialog `Multi`). Default separator `\n`. */
export function Multi(
	parts: TextWidget[],
	options: { sep?: string } = {},
): TextWidget {
	const sep = options.sep ?? "\n";
	return {
		renderText: async (rc) => {
			const rendered = await Promise.all(parts.map((p) => p.renderText(rc)));
			return rendered.map(String).join(sep);
		},
	};
}

/**
 * Pick a text widget by the value of `data[selector]` (aiogram_dialog `Case`).
 * Use `default` for the fallback branch.
 */
export function Case(
	selector: string,
	cases: Record<string, TextWidget> & { default?: TextWidget },
): TextWidget {
	return {
		renderText: (rc) => {
			const key = String(rc.data[selector]);
			const widget = cases[key] ?? cases.default;
			return widget ? widget.renderText(rc) : "";
		},
	};
}

/**
 * Render one line per item (aiogram_dialog `List`). `items` reads an array from
 * data; `item` renders each, receiving `{ item, index }` merged into data.
 */
export function List<T>(options: {
	items: (data: DataDict) => readonly T[];
	item: (item: T, index: number) => MaybePromise<Stringable>;
	sep?: string;
}): TextWidget {
	const sep = options.sep ?? "\n";
	return {
		renderText: async (rc) => {
			const list = options.items(rc.data);
			const lines = await Promise.all(list.map((it, i) => options.item(it, i)));
			return lines.map(String).join(sep);
		},
	};
}
