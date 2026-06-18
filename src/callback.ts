import { CallbackData } from "gramio";

/**
 * The dialog callback payload: which dialog instance, which widget, optional item.
 *
 * - `i` — intentId: id of the dialog *instance* (for stale-button detection).
 * - `w` — widgetId: which widget this button belongs to.
 * - `p` — payload: optional item id / operation (e.g. `"42"`, `"+"`, `"DAY:2026-06-09"`).
 */
export interface DialogCallback {
	i: string;
	w: string;
	p?: string;
}

/**
 * Pluggable encoder for dialog button `callback_data`. The default uses a native
 * gramio {@link CallbackData}; a consumer can swap the whole scheme via
 * `dialogs(list, { callback: { … } })` (custom prefix or custom pack/unpack).
 *
 * - `pack` — serialise a {@link DialogCallback} into ≤64-byte `callback_data`.
 * - `filter` — cheaply tell *our* callbacks apart from the rest of the bot's
 *   (everything else falls through to other handlers).
 * - `safeUnpack` — parse; `success: false` means "not ours / malformed".
 */
export interface DialogCodec {
	pack(data: DialogCallback): string;
	filter(raw: string): boolean;
	safeUnpack(
		raw: string,
	): { success: true; data: DialogCallback } | { success: false };
}

/** Options for the built-in codec (see {@link makeCodec}). */
export interface CallbackOptions {
	/**
	 * Prefix name hashed into a short tag that marks a `callback_data` as ours
	 * (lets `dialogs()` `filter()` dialog callbacks apart from the rest of the
	 * bot). Defaults to `"grd"`. Ignored when `pack`/`unpack` are given.
	 */
	name?: string;
	/** Fully custom encoder — keep the result ≤64 bytes. Overrides `name`. */
	pack?: (data: DialogCallback) => string;
	/** Fully custom decoder — return `null` for "not a dialog callback". */
	unpack?: (raw: string) => DialogCallback | null;
}

/** Build a {@link CallbackData}-backed codec for the given prefix `name`. */
function callbackData(name: string): DialogCodec {
	return (
		new CallbackData(name)
			.string("i")
			.string("w")
			// default "" → absent payload deserializes cleanly (no serializer warning)
			.string("p", { optional: true, default: "" })
	);
}

/**
 * Resolve the {@link DialogCodec} from user {@link CallbackOptions}: a fully
 * custom `pack`/`unpack` pair, a renamed prefix, or the default `"grd"` scheme.
 */
export function makeCodec(options?: CallbackOptions): DialogCodec {
	if (options?.pack && options?.unpack) {
		const { pack, unpack } = options;
		return {
			pack,
			filter: (raw) => unpack(raw) != null,
			safeUnpack: (raw) => {
				const data = unpack(raw);
				return data
					? { success: true as const, data }
					: { success: false as const };
			},
		};
	}
	return callbackData(options?.name ?? "grd");
}

/**
 * Default dialog callback codec (prefix `"grd"` = gramio-dialogs).
 *
 * Packed form: `<6-char tag><i>;<w>;<bitmask>[;<p>]` — the tag lets `dialogs()`
 * cheaply `filter()` dialog callbacks apart from the rest of the bot. Replaces
 * aiogram_dialog's hand-rolled `intent_id \x1D widget_id : item` protocol with a
 * native, type-safe {@link CallbackData}.
 */
export const DIALOG_CB: DialogCodec = callbackData("grd");
