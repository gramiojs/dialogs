import type { DialogManager } from "../manager.ts";
import type { InputCtx, InputWidget, MaybePromise } from "../types.ts";

export interface TextInputOptions<T = string> {
	/** Widget id — the parsed value is stored under it in widget data. */
	id: string;
	/**
	 * Parse/validate the raw message text into `T`. Throw (or let it throw) to
	 * reject — `onError` is then called. Defaults to the identity (string).
	 */
	parse?: (text: string) => T;
	onSuccess?: (ctx: InputCtx, value: T) => MaybePromise<unknown>;
	onError?: (ctx: InputCtx, error: unknown) => MaybePromise<unknown>;
}

/**
 * Typed text input (aiogram_dialog `TextInput`). Put it in a window's `input`
 * slot; it runs before `onMessage`. On a valid message it stores the parsed
 * value in widget data and calls `onSuccess`; on a parse error, `onError`.
 *
 * @example
 * ```ts
 * new Window({
 *   state: "age",
 *   input: TextInput({
 *     id: "age",
 *     parse: (t) => { const n = Number(t); if (!Number.isFinite(n)) throw new Error("not a number"); return n; },
 *     onSuccess: (ctx, age) => ctx.dialog.next(),
 *     onError: (ctx) => ctx.send("Введите число"),
 *   }),
 * });
 * ```
 */
export function TextInput<T = string>(
	options: TextInputOptions<T>,
): InputWidget {
	return {
		processInput: async (ctx) => {
			const text = ctx.text;
			if (text === undefined) return false; // non-text message → let others handle
			try {
				const value = options.parse
					? options.parse(text)
					: (text as unknown as T);
				ctx.dialog.setWidgetData(options.id, value);
				await options.onSuccess?.(ctx, value);
			} catch (error) {
				await options.onError?.(ctx, error);
			}
			return true;
		},
	};
}

/** Read a {@link TextInput}'s last stored value. */
export function getInput<T = string>(
	manager: DialogManager,
	id: string,
): T | undefined {
	return manager.widgetData<T | undefined>(id, undefined);
}
