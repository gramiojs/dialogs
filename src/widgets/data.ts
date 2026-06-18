import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	DataDict,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	Stringable,
	TextSource,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget, chunk } from "./base.ts";
import { asText } from "./text.ts";

// ───────────────────────── Tabs / SegmentedControl ─────────────────────────

export interface TabItem {
	id: string;
	label: TextSource;
}

export interface TabsOptions {
	id: string;
	items: readonly TabItem[];
	default?: string;
	/** Decorate the active tab's label. Defaults to `«label»`. */
	activeWrap?: (label: string) => string;
	onChanged?: (ctx: ClickCtx, id: string) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A single row of tabs; the active id is stored in widget data (read it in a getter). */
class TabsWidget extends KeyboardWidget {
	private readonly labels: TextWidget[];

	constructor(private readonly opts: TabsOptions) {
		super(opts.when);
		this.labels = opts.items.map((t) => asText(t.label));
	}

	private active(manager: DialogManager): string {
		return manager.widgetData<string>(
			this.opts.id,
			this.opts.default ?? this.opts.items[0]?.id ?? "",
		);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const active = this.active(rc.manager);
		const wrap = this.opts.activeWrap ?? ((l: string) => `«${l}»`);
		const row: RawButton[] = [];
		for (let i = 0; i < this.opts.items.length; i++) {
			const tab = this.opts.items[i] as TabItem;
			const label = String(await this.labels[i].renderText(rc));
			row.push({
				text: tab.id === active ? wrap(label) : label,
				cb: { widgetId: this.opts.id, payload: tab.id },
			});
		}
		return [row];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		if (payload !== this.active(manager)) {
			manager.setWidgetData(this.opts.id, payload);
			await this.opts.onChanged?.(manager.clickCtx, payload);
		}
		return true;
	}
}

export function Tabs(options: TabsOptions): Keyboard {
	return new TabsWidget(options);
}

/** Read the active tab id of a {@link Tabs} widget. */
export function getTab(
	manager: DialogManager,
	id: string,
	fallback = "",
): string {
	return manager.widgetData<string>(id, fallback);
}

// ───────────────────────── Grid ─────────────────────────

export interface GridOptions<T> {
	id: string;
	items: (data: DataDict) => readonly T[];
	itemId: (item: T) => string | number;
	text: (item: T) => Stringable;
	/** Buttons per row. Defaults to 3. */
	width?: number;
	onClick: (ctx: ClickCtx, id: string) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** Items laid out as a `width`-column grid; fires `onClick(ctx, id)`. */
class GridWidget<T> extends KeyboardWidget {
	constructor(private readonly opts: GridOptions<T>) {
		super(opts.when);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const items = this.opts.items(rc.data);
		const buttons: RawButton[] = [];
		for (const item of items)
			buttons.push({
				text: String(this.opts.text(item)),
				cb: { widgetId: this.opts.id, payload: String(this.opts.itemId(item)) },
			});
		return chunk(buttons, this.opts.width ?? 3);
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		await this.opts.onClick(manager.clickCtx, payload);
		return true;
	}
}

export function Grid<T>(options: GridOptions<T>): Keyboard {
	return new GridWidget(options);
}

// ───────────────────────── Accordion ─────────────────────────

export interface AccordionSection {
	id: string;
	header: TextSource;
	/** Keyboard shown while the section is expanded. */
	body: Keyboard;
}

export interface AccordionOptions {
	id: string;
	sections: readonly AccordionSection[];
	/** Allow several sections open at once. Defaults to false (single-open). */
	multi?: boolean;
	expandedIcon?: string;
	collapsedIcon?: string;
	when?: WhenCondition;
}

/** Collapsible sections — tap a header to expand its child keyboard. */
class AccordionWidget extends KeyboardWidget {
	private readonly headers: TextWidget[];

	constructor(private readonly opts: AccordionOptions) {
		super(opts.when);
		this.headers = opts.sections.map((s) => asText(s.header));
	}

	private open(manager: DialogManager): string[] {
		return manager.widgetData<string[]>(this.opts.id, []);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const open = this.open(rc.manager);
		const expanded = this.opts.expandedIcon ?? "▼";
		const collapsed = this.opts.collapsedIcon ?? "▶";
		const rows: RawButton[][] = [];
		for (let i = 0; i < this.opts.sections.length; i++) {
			const section = this.opts.sections[i] as AccordionSection;
			const isOpen = open.includes(section.id);
			const label = String(await this.headers[i].renderText(rc));
			rows.push([
				{
					text: `${isOpen ? expanded : collapsed} ${label}`,
					cb: { widgetId: this.opts.id, payload: `h${i}` },
				},
			]);
			if (isOpen) rows.push(...(await section.body.renderKeyboard(rc)));
		}
		return rows;
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId === this.opts.id && payload?.startsWith("h")) {
			const index = Number.parseInt(payload.slice(1), 10);
			const section = this.opts.sections[index];
			if (section) this.toggle(manager, section.id);
			return true;
		}
		// delegate to the bodies of open sections
		const open = this.open(manager);
		for (const section of this.opts.sections) {
			if (!open.includes(section.id)) continue;
			if (await section.body.processCallback(widgetId, payload, manager))
				return true;
		}
		return false;
	}

	private toggle(manager: DialogManager, sectionId: string): void {
		const open = this.open(manager);
		if (open.includes(sectionId))
			manager.setWidgetData(
				this.opts.id,
				open.filter((id) => id !== sectionId),
			);
		else
			manager.setWidgetData(
				this.opts.id,
				this.opts.multi ? [...open, sectionId] : [sectionId],
			);
	}
}

export function Accordion(options: AccordionOptions): Keyboard {
	return new AccordionWidget(options);
}

// ───────────────────────── Breadcrumbs ─────────────────────────

export interface BreadcrumbsOptions {
	/** Map a state key to a human label. Defaults to the raw state key. */
	labels?: Record<string, TextSource>;
	sep?: string;
}

/** A text trail of the visited window states (`Home › Settings › Audio`). */
export function Breadcrumbs(options: BreadcrumbsOptions = {}): TextWidget {
	const sep = options.sep ?? " › ";
	return {
		renderText: async (rc) => {
			const labels = options.labels ?? {};
			const parts = await Promise.all(
				rc.manager.history.map(async (state) => {
					const label = labels[state];
					return label === undefined
						? state
						: String(await asText(label).renderText(rc));
				}),
			);
			return parts.join(sep);
		},
	};
}

// ───────────────────────── AsyncSelect / InfiniteScroll ─────────────────────────

export interface AsyncSelectOptions<T> {
	id: string;
	/** Page size. Defaults to 5. */
	pageSize?: number;
	/**
	 * Load one page. Return fewer than `limit` items to signal the last page.
	 * The second arg is the {@link RenderContext} — read `rc.data` or widget
	 * state (e.g. an active {@link Tabs} filter) to scope the query.
	 */
	load: (
		params: { offset: number; limit: number },
		rc: RenderContext,
	) => MaybePromise<readonly T[]>;
	itemId: (item: T) => string | number;
	text: (item: T) => Stringable;
	onClick: (ctx: ClickCtx, id: string) => MaybePromise<unknown>;
	prevText?: string;
	nextText?: string;
	when?: WhenCondition;
}

/** A paginated, async-loaded list (offset-based) with `‹ Prev` / `Next ›` controls. */
class AsyncSelectWidget<T> extends KeyboardWidget {
	private readonly pageSize: number;

	constructor(private readonly opts: AsyncSelectOptions<T>) {
		super(opts.when);
		this.pageSize = opts.pageSize ?? 5;
	}

	private offset(manager: DialogManager): number {
		return manager.widgetData<number>(this.opts.id, 0);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const offset = this.offset(rc.manager);
		const items = await this.opts.load({ offset, limit: this.pageSize }, rc);
		const rows: RawButton[][] = items.map((item) => [
			{
				text: String(this.opts.text(item)),
				cb: {
					widgetId: this.opts.id,
					payload: `i${this.opts.itemId(item)}`,
				},
			},
		]);

		const pager: RawButton[] = [];
		if (offset > 0)
			pager.push({
				text: this.opts.prevText ?? "‹ Prev",
				cb: { widgetId: this.opts.id, payload: "<" },
			});
		if (items.length >= this.pageSize)
			pager.push({
				text: this.opts.nextText ?? "Next ›",
				cb: { widgetId: this.opts.id, payload: ">" },
			});
		if (pager.length > 0) rows.push(pager);
		return rows;
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		if (payload === ">")
			manager.setWidgetData(this.opts.id, this.offset(manager) + this.pageSize);
		else if (payload === "<")
			manager.setWidgetData(
				this.opts.id,
				Math.max(0, this.offset(manager) - this.pageSize),
			);
		else if (payload.startsWith("i"))
			await this.opts.onClick(manager.clickCtx, payload.slice(1));
		return true;
	}
}

export function AsyncSelect<T>(options: AsyncSelectOptions<T>): Keyboard {
	return new AsyncSelectWidget(options);
}
