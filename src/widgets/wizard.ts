import { Dialog } from "../dialog.ts";
import type { DialogManager } from "../manager.ts";
import type {
	InputCtx,
	MaybePromise,
	Stringable,
	TextSource,
} from "../types.ts";
import { Window } from "../window.ts";
import { asText } from "./text.ts";

/**
 * Minimal [Standard Schema](https://standardschema.dev) v1 shape — the spec
 * implemented by zod (3.24+), valibot, arktype, … so any of them work as a
 * field validator without this library depending on a specific one.
 */
export interface StandardSchemaV1<Output = unknown> {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
	};
}

type StandardResult<O> =
	| { readonly value: O; readonly issues?: undefined }
	| { readonly issues: ReadonlyArray<{ readonly message: string }> };

/** A field's validator: a Standard Schema, or a `(raw) => value` fn (throw to reject). */
export type FieldValidator =
	| StandardSchemaV1
	| ((raw: string) => unknown | Promise<unknown>);

export interface FormField {
	/** Key under which the parsed value is stored in the result object. */
	id: string;
	/** Question shown for this step. */
	prompt: TextSource;
	/** Validate/parse the raw message text. Omit to accept the string as-is. */
	schema?: FieldValidator;
}

export interface FormOptions {
	id: string;
	fields: readonly FormField[];
	onSubmit: (
		ctx: InputCtx,
		values: Record<string, unknown>,
	) => MaybePromise<unknown>;
	/** Header above each step (e.g. a `Stepper`). Defaults to `Step n/total`. */
	header?: TextSource;
	/** Render a validation error. Defaults to `⚠️ <message>`. */
	error?: (message: string) => Stringable;
}

async function validate(field: FormField, raw: string): Promise<unknown> {
	const s = field.schema;
	if (!s) return raw;
	if (typeof s === "function") return s(raw);
	const result = await s["~standard"].validate(raw);
	if ("issues" in result && result.issues)
		throw new Error(result.issues.map((i) => i.message).join("; "));
	return (result as { value: unknown }).value;
}

/**
 * A linear, validated input wizard as a ready-to-register {@link Dialog}. Each
 * field asks a question; the user's reply is validated (Standard Schema or a
 * parse fn) and collected; after the last field, `onSubmit(ctx, values)` fires.
 * State (current step + collected values) lives in `dialogData`, so it persists
 * per-user via the storage adapter.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * const signup = Form({
 *   id: "signup",
 *   fields: [
 *     { id: "name", prompt: "Your name?", schema: z.string().min(2) },
 *     { id: "age", prompt: "Your age?", schema: z.coerce.number().int().min(0) },
 *   ],
 *   onSubmit: (ctx, v) => ctx.send(`Hi ${v.name}, age ${v.age}`),
 * });
 * dialogs([signup]);
 * ```
 */
export function Form(options: FormOptions): Dialog {
	const fields = options.fields;
	const header = options.header ? asText(options.header) : undefined;
	const prompts = fields.map((f) => asText(f.prompt));
	const renderError = options.error ?? ((m: string) => `⚠️ ${m}`);

	const window = new Window({
		state: "step",
		text: async (_data, rc) => {
			const dd = rc.manager.data;
			const step = (dd.step as number) ?? 0;
			// expose step/total at the top level so a `Stepper` header can read them
			const ctx = {
				manager: rc.manager,
				data: { ...rc.data, step, total: fields.length },
			};
			const parts: string[] = [];
			parts.push(
				header
					? String(await header.renderText(ctx))
					: `Step ${step + 1}/${fields.length}`,
			);
			if (dd.error) parts.push(String(renderError(dd.error as string)));
			parts.push(String(await prompts[step].renderText(ctx)));
			return parts.join("\n\n");
		},
		input: {
			processInput: async (ctx: InputCtx) => {
				const text = ctx.text;
				if (text === undefined) return false;
				const dd = ctx.dialog.data;
				dd.error = undefined; // clear any prior error
				const step = (dd.step as number) ?? 0;
				const field = fields[step] as FormField;

				let value: unknown;
				try {
					value = await validate(field, text);
				} catch (e) {
					dd.error = e instanceof Error ? e.message : String(e);
					await ctx.dialog.show(); // re-prompt with the error
					return true;
				}

				if (!dd.values) dd.values = {};
				const values = dd.values as Record<string, unknown>;
				values[field.id] = value;

				if (step + 1 >= fields.length) {
					await options.onSubmit(ctx, { ...values });
				} else {
					dd.step = step + 1;
					await ctx.dialog.show(); // ask the next field
				}
				return true;
			},
		},
	});

	return new Dialog({
		id: options.id,
		onStart: (manager: DialogManager) => {
			manager.data.step = 0;
			manager.data.values = {};
		},
		windows: [window],
	});
}

/** Read a {@link Form}'s collected values mid-flight from `dialogData`. */
export function getFormValues(manager: DialogManager): Record<string, unknown> {
	return { ...((manager.data.values as Record<string, unknown>) ?? {}) };
}
