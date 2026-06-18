import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";

export interface ScrollingGroupOptions {
	id: string;
	/** Rows shown per page. */
	height: number;
	/** Hide the pager when there is only one page. */
	hideOnSinglePage?: boolean;
	/** Render the built-in pager row. Set `false` to use standalone pagers. */
	pager?: boolean;
	onPageChanged?: (ctx: ClickCtx, page: number) => MaybePromise<unknown>;
	when?: WhenCondition;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

const PAGES_SUFFIX = "#pages";

/** Read the current page / page-count a ScrollingGroup stored under `scrollId`. */
export function pageState(
	manager: DialogManager,
	scrollId: string,
): { page: number; pages: number } {
	return {
		page: manager.widgetData<number>(scrollId, 0),
		pages: manager.widgetData<number>(scrollId + PAGES_SUFFIX, 1),
	};
}

/**
 * Paginates the rows produced by its children (e.g. a {@link Select} over a
 * long list). The current page is stored in widget data.
 */
class ScrollingGroupWidget extends KeyboardWidget {
	constructor(
		private readonly children: Keyboard[],
		private readonly opts: ScrollingGroupOptions,
		when?: WhenCondition,
	) {
		super(when);
	}

	private page(manager: DialogManager): number {
		return manager.widgetData<number>(this.opts.id, 0);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const childRows = await Promise.all(
			this.children.map((child) => child.renderKeyboard(rc)),
		);
		const allRows = childRows.flat();
		const { height, id } = this.opts;
		const pageCount = Math.max(1, Math.ceil(allRows.length / height));
		const page = clamp(this.page(rc.manager), 0, pageCount - 1);
		// expose page count for standalone pager widgets
		rc.manager.setWidgetData(id + PAGES_SUFFIX, pageCount);

		const start = page * height;
		const rows = allRows.slice(start, start + height);

		if ((this.opts.pager ?? true) && pageCount > 1)
			rows.push(this.pager(id, page, pageCount));
		return rows;
	}

	private pager(id: string, page: number, pageCount: number): RawButton[] {
		const btn = (text: string, target: number): RawButton => ({
			text,
			cb: { widgetId: id, payload: String(clamp(target, 0, pageCount - 1)) },
		});
		return [
			btn("«", 0),
			btn("‹", page - 1),
			{
				text: `${page + 1}/${pageCount}`,
				cb: { widgetId: id, payload: String(page) },
			},
			btn("›", page + 1),
			btn("»", pageCount - 1),
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		// children (the paged buttons) get first crack at their own ids
		for (const child of this.children) {
			if (await child.processCallback(widgetId, payload, manager)) return true;
		}
		if (widgetId !== this.opts.id || payload === undefined) return false;

		const next = Number.parseInt(payload, 10);
		if (Number.isNaN(next)) return true;
		if (next === this.page(manager)) return true; // no-op (e.g. page indicator tap)
		manager.setWidgetData(this.opts.id, next);
		await this.opts.onPageChanged?.(manager.clickCtx, next);
		return true;
	}
}

export function ScrollingGroup(
	children: Keyboard[],
	options: ScrollingGroupOptions,
): Keyboard {
	return new ScrollingGroupWidget(children, options, options.when);
}

// ───────────────────────── standalone pagers ─────────────────────────

type PagerKind = "first" | "prev" | "next" | "last";

/**
 * A single page-navigation button targeting a {@link ScrollingGroup} by id.
 * Lets you place pager controls anywhere (use `ScrollingGroup(..., { pager: false })`).
 */
class PageNavWidget extends KeyboardWidget {
	constructor(
		private readonly label: string,
		private readonly scrollId: string,
		private readonly kind: PagerKind,
		when?: WhenCondition,
	) {
		super(when);
	}

	private target(page: number, pages: number): number {
		switch (this.kind) {
			case "first":
				return 0;
			case "prev":
				return clamp(page - 1, 0, pages - 1);
			case "next":
				return clamp(page + 1, 0, pages - 1);
			case "last":
				return pages - 1;
		}
	}

	protected render(rc: RenderContext): RawButton[][] {
		const { page, pages } = pageState(rc.manager, this.scrollId);
		return [
			[
				{
					text: this.label,
					cb: {
						widgetId: this.scrollId,
						payload: String(this.target(page, pages)),
					},
				},
			],
		];
	}

	processCallback(): boolean {
		return false; // the ScrollingGroup owns `scrollId`
	}
}

export interface PagerButtonOptions {
	scrollId: string;
	text?: string;
	when?: WhenCondition;
}

export const FirstPage = (o: PagerButtonOptions): Keyboard =>
	new PageNavWidget(o.text ?? "«", o.scrollId, "first", o.when);
export const PrevPage = (o: PagerButtonOptions): Keyboard =>
	new PageNavWidget(o.text ?? "‹", o.scrollId, "prev", o.when);
export const NextPage = (o: PagerButtonOptions): Keyboard =>
	new PageNavWidget(o.text ?? "›", o.scrollId, "next", o.when);
export const LastPage = (o: PagerButtonOptions): Keyboard =>
	new PageNavWidget(o.text ?? "»", o.scrollId, "last", o.when);

/** Text widget showing `current/total` for a ScrollingGroup. */
export function CurrentPage(
	scrollId: string,
	format: (page: number, pages: number) => string = (p, t) => `${p}/${t}`,
): TextWidget {
	return {
		renderText: (rc) => {
			const { page, pages } = pageState(rc.manager, scrollId);
			return format(page + 1, pages);
		},
	};
}
