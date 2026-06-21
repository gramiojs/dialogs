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
import { KeyboardWidget } from "./base.ts";
import { Const, asText } from "./text.ts";

function augment(rc: RenderContext, extra: DataDict): RenderContext {
	return { manager: rc.manager, data: { ...rc.data, ...extra } };
}

/** State passed to per-item text callbacks of Select/Multiselect/Radio. */
export interface ItemState<T> {
	item: T;
	index: number;
	checked: boolean;
	data: DataDict;
}

/** Per-item text: a `TextWidget`, or a typed `(state) => …` callback. */
export type ItemText<T> = TextWidget | ((state: ItemState<T>) => Stringable);

function itemTextWidget<T>(src: ItemText<T>): TextWidget {
	if (typeof src !== "function") return src;
	return {
		renderText: (rc) =>
			src({
				item: rc.data.item as T,
				index: (rc.data.index as number) ?? 0,
				checked: (rc.data.checked as boolean) ?? false,
				data: rc.data,
			}),
	};
}

// ───────────────────────── Counter ─────────────────────────

export interface CounterOptions {
	id: string;
	/** Value button text — `(data) => …` gets `{ value }`. Defaults to the number. */
	text?: TextSource;
	plusText?: TextSource;
	minusText?: TextSource;
	min?: number;
	max?: number;
	step?: number;
	default?: number;
	/** Wrap around min/max instead of clamping. */
	cyclic?: boolean;
	onChanged?: (ctx: ClickCtx, value: number) => MaybePromise<unknown>;
	when?: WhenCondition;
}

class CounterWidget extends KeyboardWidget {
	private readonly o: {
		id: string;
		min: number;
		max: number;
		step: number;
		default: number;
		cyclic: boolean;
		text?: TextWidget;
		plusText: TextWidget;
		minusText: TextWidget;
		onChanged?: CounterOptions["onChanged"];
	};
	// (text sources normalised to TextWidget in the constructor)

	constructor(options: CounterOptions) {
		super(options.when);
		this.o = {
			id: options.id,
			min: options.min ?? Number.NEGATIVE_INFINITY,
			max: options.max ?? Number.POSITIVE_INFINITY,
			step: options.step ?? 1,
			default: options.default ?? 0,
			cyclic: options.cyclic ?? false,
			text: options.text === undefined ? undefined : asText(options.text),
			plusText: asText(options.plusText ?? "➕"),
			minusText: asText(options.minusText ?? "➖"),
			onChanged: options.onChanged,
		};
	}

	private value(manager: DialogManager): number {
		return manager.widgetData<number>(this.o.id, this.o.default);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const value = this.value(rc.manager);
		const valueText = this.o.text
			? String(await this.o.text.renderText(augment(rc, { value })))
			: String(value);
		return [
			[
				{
					text: String(await this.o.minusText.renderText(rc)),
					cb: { widgetId: this.o.id, payload: "-" },
				},
				{ text: valueText, cb: { widgetId: this.o.id, payload: "=" } },
				{
					text: String(await this.o.plusText.renderText(rc)),
					cb: { widgetId: this.o.id, payload: "+" },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.o.id) return false;
		if (payload !== "+" && payload !== "-") return true; // value tap: no-op for now

		let value =
			this.value(manager) + (payload === "+" ? this.o.step : -this.o.step);
		const { min, max, cyclic } = this.o;
		if (value > max) value = cyclic && Number.isFinite(min) ? min : max;
		if (value < min) value = cyclic && Number.isFinite(max) ? max : min;

		manager.setWidgetData(this.o.id, value);
		await this.o.onChanged?.(manager.clickCtx, value);
		return true;
	}
}

export function Counter(options: CounterOptions): Keyboard {
	return new CounterWidget(options);
}

// ───────────────────────── item-based widgets ─────────────────────────

export type ItemsGetter<T> = (data: DataDict) => readonly T[];
export type ItemId<T> = (item: T) => string | number;
export type OnItemClick<T> = (
	ctx: ClickCtx,
	id: string,
	item: T | undefined,
) => MaybePromise<unknown>;

abstract class ItemWidget<T> extends KeyboardWidget {
	constructor(
		protected readonly id: string,
		protected readonly items: ItemsGetter<T>,
		protected readonly itemId: ItemId<T>,
		when?: WhenCondition,
	) {
		super(when);
	}

	/** Per-item button text. */
	protected abstract itemText(
		rc: RenderContext,
		item: T,
		idStr: string,
		index: number,
	): MaybePromise<Stringable>;

	/** Handle a click on the item with the given id. */
	protected abstract onItem(
		manager: DialogManager,
		idStr: string,
		item: T | undefined,
	): MaybePromise<void>;

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const list = this.items(rc.data);
		const buttons: RawButton[] = [];
		for (let index = 0; index < list.length; index++) {
			const item = list[index] as T;
			const idStr = String(this.itemId(item));
			buttons.push({
				text: String(await this.itemText(rc, item, idStr, index)),
				cb: { widgetId: this.id, payload: idStr },
			});
		}
		return buttons.map((button) => [button]);
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.id || payload === undefined) return false;
		await this.onItem(manager, payload, undefined);
		return true;
	}
}

// ───────────────────────── Select ─────────────────────────

export interface SelectOptions<T> {
	id: string;
	/** Per-item text: a `(state) => …` callback (typed `item`) or a `TextWidget`. */
	text: ItemText<T>;
	items: ItemsGetter<T>;
	/**
	 * Stable id per item. Must be **collision-free as a string** (`String(id)`): the
	 * ✓-match ({@link SelectOptions.selected}) and `callback_data` routing compare
	 * ids stringified, so `1` and `"1"` would collide. Keep ids short — they ride in
	 * `callback_data` (Telegram's 64-byte cap); prefer list indices over long strings.
	 */
	itemId: ItemId<T>;
	onClick: OnItemClick<T>;
	/**
	 * For a stateless Select backed by external state (e.g. a setting in your DB),
	 * return the currently-selected `itemId`. The matching item gets `checked: true`
	 * in its text-state and a ✓ ({@link SelectOptions.selectedMark}) appended — no
	 * need to compute the mark by hand from `st.data`. `data` is the merged render
	 * bag (getter output + `dialogData`), same as `items`/`text` see. If your `text`
	 * callback already appends its own mark from `st.checked`, set `selectedMark: ""`
	 * to avoid a double mark.
	 */
	selected?: (data: DataDict) => string | number | undefined;
	/** Suffix appended to the selected item's label. Defaults to `" ✓"`. */
	selectedMark?: string;
	when?: WhenCondition;
}

class SelectWidget<T> extends ItemWidget<T> {
	constructor(private readonly opts: SelectOptions<T>) {
		super(opts.id, opts.items, opts.itemId, opts.when);
	}

	protected async itemText(
		rc: RenderContext,
		item: T,
		idStr: string,
		index: number,
	): Promise<Stringable> {
		const sel = this.opts.selected?.(rc.data);
		const checked = sel !== undefined && String(sel) === idStr;
		const label = await itemTextWidget<T>(this.opts.text).renderText(
			augment(rc, { item, index, checked }),
		);
		return checked ? `${label}${this.opts.selectedMark ?? " ✓"}` : label;
	}

	protected async onItem(manager: DialogManager, idStr: string): Promise<void> {
		await this.opts.onClick(manager.clickCtx, idStr, undefined);
	}
}

/** A list of buttons, one per item; fires `onClick(ctx, id)`. Stateless. */
export function Select<T>(options: SelectOptions<T>): Keyboard {
	return new SelectWidget(options);
}

// ───────────────────────── Multiselect ─────────────────────────

export interface MultiselectOptions<T> {
	id: string;
	checkedText: ItemText<T>;
	uncheckedText: ItemText<T>;
	items: ItemsGetter<T>;
	itemId: ItemId<T>;
	/** Cap on number of selected items. */
	max?: number;
	onChanged?: (ctx: ClickCtx, selected: string[]) => MaybePromise<unknown>;
	when?: WhenCondition;
}

class MultiselectWidget<T> extends ItemWidget<T> {
	constructor(private readonly opts: MultiselectOptions<T>) {
		super(opts.id, opts.items, opts.itemId, opts.when);
	}

	protected itemText(
		rc: RenderContext,
		item: T,
		idStr: string,
		index: number,
	): Promise<Stringable> {
		const selected = rc.manager.widgetData<string[]>(this.id, []);
		const checked = selected.includes(idStr);
		const widget = checked ? this.opts.checkedText : this.opts.uncheckedText;
		return Promise.resolve(
			itemTextWidget<T>(widget).renderText(
				augment(rc, { item, index, checked }),
			),
		);
	}

	protected async onItem(manager: DialogManager, idStr: string): Promise<void> {
		const selected = manager.widgetData<string[]>(this.id, []);
		const at = selected.indexOf(idStr);
		if (at >= 0) selected.splice(at, 1);
		else if (this.opts.max === undefined || selected.length < this.opts.max)
			selected.push(idStr);
		manager.setWidgetData(this.id, selected);
		await this.opts.onChanged?.(manager.clickCtx, [...selected]);
	}
}

/** Toggleable multi-selection; stores selected ids in widget data. */
export function Multiselect<T>(options: MultiselectOptions<T>): Keyboard {
	return new MultiselectWidget(options);
}

/** Read the current Multiselect/Radio selection from widget data. */
export function getSelected(
	manager: DialogManager,
	widgetId: string,
): string[] {
	const value = manager.widgetData<string[] | string | undefined>(widgetId, []);
	// Return a copy (like getTags/getReactions) so callers can't mutate the
	// persisted selection in place.
	if (Array.isArray(value)) return [...value];
	return value === undefined ? [] : [value];
}

// ───────────────────────── Radio ─────────────────────────

export interface RadioOptions<T> {
	id: string;
	checkedText: ItemText<T>;
	uncheckedText: ItemText<T>;
	items: ItemsGetter<T>;
	itemId: ItemId<T>;
	onChanged?: (ctx: ClickCtx, selected: string) => MaybePromise<unknown>;
	when?: WhenCondition;
}

class RadioWidget<T> extends ItemWidget<T> {
	constructor(private readonly opts: RadioOptions<T>) {
		super(opts.id, opts.items, opts.itemId, opts.when);
	}

	protected itemText(
		rc: RenderContext,
		item: T,
		idStr: string,
		index: number,
	): Promise<Stringable> {
		const current = rc.manager.widgetData<string | undefined>(
			this.id,
			undefined,
		);
		const checked = current === idStr;
		const widget = checked ? this.opts.checkedText : this.opts.uncheckedText;
		return Promise.resolve(
			itemTextWidget<T>(widget).renderText(
				augment(rc, { item, index, checked }),
			),
		);
	}

	protected async onItem(manager: DialogManager, idStr: string): Promise<void> {
		manager.setWidgetData(this.id, idStr);
		await this.opts.onChanged?.(manager.clickCtx, idStr);
	}
}

/** Single-selection radio group; stores the selected id in widget data. */
export function Radio<T>(options: RadioOptions<T>): Keyboard {
	return new RadioWidget(options);
}

// ───────────────────────── Checkbox ─────────────────────────

export interface CheckboxOptions {
	id: string;
	checkedText: TextSource;
	uncheckedText: TextSource;
	default?: boolean;
	onChanged?: (ctx: ClickCtx, checked: boolean) => MaybePromise<unknown>;
	when?: WhenCondition;
}

class CheckboxWidget extends KeyboardWidget {
	constructor(private readonly opts: CheckboxOptions) {
		super(opts.when);
	}

	private checked(manager: DialogManager): boolean {
		return manager.widgetData<boolean>(
			this.opts.id,
			this.opts.default ?? false,
		);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const checked = this.checked(rc.manager);
		const src = checked ? this.opts.checkedText : this.opts.uncheckedText;
		return [
			[
				{
					text: String(await asText(src).renderText(augment(rc, { checked }))),
					cb: { widgetId: this.opts.id },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		_payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id) return false;
		const next = !this.checked(manager);
		manager.setWidgetData(this.opts.id, next);
		await this.opts.onChanged?.(manager.clickCtx, next);
		return true;
	}
}

/** A single toggle button storing a boolean in widget data. */
export function Checkbox(options: CheckboxOptions): Keyboard {
	return new CheckboxWidget(options);
}

/** Read a Checkbox value from widget data. */
export function isChecked(
	manager: DialogManager,
	widgetId: string,
	fallback = false,
): boolean {
	return manager.widgetData<boolean>(widgetId, fallback);
}

// ───────────────────────── Toggle ─────────────────────────

export interface ToggleOptions<T> {
	id: string;
	/** Static list of options to cycle through. */
	items: readonly T[];
	itemId: ItemId<T>;
	/** Button text for the current item: `(state) => …` (typed) or a `TextWidget`. */
	text: ItemText<T>;
	onChanged?: (ctx: ClickCtx, item: T, id: string) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A single button that cycles through `items` on each tap (aiogram_dialog `Toggle`). */
class ToggleWidget<T> extends KeyboardWidget {
	constructor(private readonly opts: ToggleOptions<T>) {
		super(opts.when);
	}

	private index(manager: DialogManager): number {
		const len = this.opts.items.length || 1;
		return manager.widgetData<number>(this.opts.id, 0) % len;
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const { items } = this.opts;
		if (items.length === 0) return [];
		const index = this.index(rc.manager);
		const item = items[index] as T;
		return [
			[
				{
					text: String(
						await itemTextWidget<T>(this.opts.text).renderText(
							augment(rc, { item, index }),
						),
					),
					cb: { widgetId: this.opts.id },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		_payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id) return false;
		const { items } = this.opts;
		if (items.length === 0) return true;
		const next = (this.index(manager) + 1) % items.length;
		manager.setWidgetData(this.opts.id, next);
		const item = items[next] as T;
		await this.opts.onChanged?.(
			manager.clickCtx,
			item,
			String(this.opts.itemId(item)),
		);
		return true;
	}
}

export function Toggle<T>(options: ToggleOptions<T>): Keyboard {
	return new ToggleWidget(options);
}

/** Read the current Toggle index from widget data. */
export function getToggle(manager: DialogManager, widgetId: string): number {
	return manager.widgetData<number>(widgetId, 0);
}
