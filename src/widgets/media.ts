import { barcodePNG, qrcodePNG } from "etiket";
import { MediaUpload } from "gramio";
import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	DataDict,
	Keyboard,
	MaybePromise,
	MediaType,
	MediaWidget,
	RawButton,
	RenderContext,
	RenderedMedia,
	WhenCondition,
} from "../types.ts";
import { isHidden } from "./base.ts";

/** A fixed photo/video/etc by file_id or URL. */
export function StaticMedia(
	media: string,
	type: MediaType = "photo",
): MediaWidget {
	return { renderMedia: () => ({ type, media }) };
}

/** Media computed from render data (e.g. a per-item photo). Return `undefined` for no media. */
export function DynamicMedia(
	fn: (data: DataDict) => MaybePromise<RenderedMedia | undefined>,
): MediaWidget {
	return { renderMedia: (rc) => fn(rc.data) };
}

// ───────────────────────── MediaScroll (carousel) ─────────────────────────

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Widget-data suffix where a {@link MediaScroll} caches its current item count. */
const COUNT_SUFFIX = "#count";

export interface MediaScrollOptions<Data extends DataDict = DataDict> {
	/** Widget id — the current page index is stored under it in widget data. */
	id: string;
	/** The media frames to scroll through — a static array or computed from data. */
	items:
		| readonly RenderedMedia[]
		| ((
				data: Data,
				rc: RenderContext<Data>,
		  ) => MaybePromise<readonly RenderedMedia[]>);
	/** Render the built-in `‹ i/N ›` pager row. Defaults to `true`. */
	pager?: boolean;
	/** Called after the visible frame changes. */
	onPageChanged?: (ctx: ClickCtx, page: number) => MaybePromise<unknown>;
	/** Hides the pager keyboard when falsy (does not affect the media itself). */
	when?: WhenCondition<Data>;
}

/**
 * A swipeable media carousel (aiogram_dialog `MediaScroll`). One object that is
 * **both** a {@link MediaWidget} and a {@link Keyboard}: put it in the window's
 * `media` slot to show the current frame, and in the keyboard tree to render the
 * `‹ i/N ›` pager (e.g. `media: gallery, keyboard: Column([gallery, Back()])`).
 */
class MediaScrollWidget<Data extends DataDict>
	implements MediaWidget<Data>, Keyboard<Data>
{
	constructor(private readonly opts: MediaScrollOptions<Data>) {}

	private page(manager: DialogManager): number {
		return manager.widgetData<number>(this.opts.id, 0);
	}

	private resolve(
		rc: RenderContext<Data>,
	): MaybePromise<readonly RenderedMedia[]> {
		const { items } = this.opts;
		return typeof items === "function" ? items(rc.data, rc) : items;
	}

	async renderMedia(
		rc: RenderContext<Data>,
	): Promise<RenderedMedia | undefined> {
		const items = await this.resolve(rc);
		rc.manager.setWidgetData(this.opts.id + COUNT_SUFFIX, items.length);
		if (items.length === 0) return undefined;
		return items[clamp(this.page(rc.manager), 0, items.length - 1)];
	}

	async renderKeyboard(rc: RenderContext<Data>): Promise<RawButton[][]> {
		if (isHidden(this.opts.when as WhenCondition | undefined, rc)) return [];
		const items = await this.resolve(rc);
		const count = items.length;
		rc.manager.setWidgetData(this.opts.id + COUNT_SUFFIX, count);
		if (this.opts.pager === false || count <= 1) return [];

		const page = clamp(this.page(rc.manager), 0, count - 1);
		const id = this.opts.id;
		const btn = (text: string, target: number): RawButton => ({
			text,
			cb: { widgetId: id, payload: String(clamp(target, 0, count - 1)) },
		});
		return [
			[
				btn("‹", page - 1),
				{
					text: `${page + 1}/${count}`,
					cb: { widgetId: id, payload: String(page) },
				},
				btn("›", page + 1),
			],
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const next = Number.parseInt(payload, 10);
		if (Number.isNaN(next)) return true;
		const count = manager.widgetData<number>(this.opts.id + COUNT_SUFFIX, 1);
		const target = clamp(next, 0, Math.max(0, count - 1));
		if (target === this.page(manager)) return true; // no-op (e.g. counter tap)
		manager.setWidgetData(this.opts.id, target);
		await this.opts.onPageChanged?.(manager.clickCtx, target);
		return true;
	}
}

export function MediaScroll<Data extends DataDict = DataDict>(
	options: MediaScrollOptions<Data>,
): MediaWidget<Data> & Keyboard<Data> {
	return new MediaScrollWidget(options);
}

/** Read a {@link MediaScroll}'s current page and item count programmatically. */
export function mediaScrollPage(
	manager: DialogManager,
	id: string,
): { page: number; count: number } {
	return {
		page: manager.widgetData<number>(id, 0),
		count: manager.widgetData<number>(id + COUNT_SUFFIX, 1),
	};
}

// ───────────────────────── QR / Barcode ─────────────────────────

export interface QROptions<Data extends DataDict = DataDict> {
	/** The text/URL to encode — static or computed from data. */
	data: string | ((data: Data) => string);
	/** QR module size in px. Defaults to 8. */
	moduleSize?: number;
	/** Quiet-zone margin (modules). Defaults to 4. */
	margin?: number;
	/**
	 * Override generation with an image URL (skips etiket) — e.g. a self-hosted
	 * QR service. Receives the encoded value.
	 */
	endpoint?: (value: string) => string;
}

/**
 * A QR code as a photo, generated locally with
 * [etiket](https://github.com/productdevbook/etiket) (zero-dependency PNG) — no
 * external service. Pass `endpoint` to use an image URL instead. Window `media`.
 */
export function QR<Data extends DataDict = DataDict>(
	options: QROptions<Data>,
): MediaWidget<Data> {
	return {
		renderMedia: (rc) => {
			const value =
				typeof options.data === "function"
					? options.data(rc.data)
					: options.data;
			if (options.endpoint)
				return { type: "photo", media: options.endpoint(value) };
			const png = qrcodePNG(value, {
				moduleSize: options.moduleSize ?? 8,
				margin: options.margin ?? 4,
			});
			return {
				type: "photo",
				media: MediaUpload.buffer(new Uint8Array(png), "qr.png"),
			};
		},
	};
}

/** A barcode symbology supported by etiket (a subset; 40+ are available). */
export type BarcodeType =
	| "code128"
	| "code39"
	| "ean13"
	| "ean8"
	| "upca"
	| "itf"
	| "datamatrix"
	| "pdf417"
	| "aztec"
	| (string & {});

export interface BarcodeOptions<Data extends DataDict = DataDict> {
	/** The value to encode — static or computed from data. */
	data: string | ((data: Data) => string);
	/** Symbology. Defaults to `"code128"`. */
	type?: BarcodeType;
	height?: number;
	scale?: number;
}

/**
 * A barcode as a photo, generated locally with etiket (40+ symbologies, zero
 * dependencies). Use as a window's `media`.
 */
export function Barcode<Data extends DataDict = DataDict>(
	options: BarcodeOptions<Data>,
): MediaWidget<Data> {
	return {
		renderMedia: (rc) => {
			const value =
				typeof options.data === "function"
					? options.data(rc.data)
					: options.data;
			const png = barcodePNG(value, {
				type: options.type ?? "code128",
				height: options.height ?? 80,
				scale: options.scale ?? 2,
			} as Parameters<typeof barcodePNG>[1]);
			return {
				type: "photo",
				media: MediaUpload.buffer(new Uint8Array(png), "barcode.png"),
			};
		},
	};
}
