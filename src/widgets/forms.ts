import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	DataDict,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	TextSource,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget, chunk } from "./base.ts";
import { asText } from "./text.ts";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// ───────────────────────── Rating ─────────────────────────

export interface RatingOptions {
	id: string;
	/** Number of stars. Defaults to 5. */
	max?: number;
	/** Initial value (0 = unrated). Defaults to 0. */
	default?: number;
	/** Glyph for a filled star. Defaults to `⭐`. */
	filled?: string;
	/** Glyph for an empty star. Defaults to `☆`. */
	empty?: string;
	onChanged?: (ctx: ClickCtx, value: number) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A row of tappable stars storing a 0–`max` rating in widget data. */
class RatingWidget extends KeyboardWidget {
	private readonly max: number;
	private readonly initial: number;
	private readonly filled: string;
	private readonly empty: string;

	constructor(private readonly opts: RatingOptions) {
		super(opts.when);
		this.max = opts.max ?? 5;
		this.initial = opts.default ?? 0;
		this.filled = opts.filled ?? "⭐";
		this.empty = opts.empty ?? "☆";
	}

	private value(manager: DialogManager): number {
		return manager.widgetData<number>(this.opts.id, this.initial);
	}

	protected render(rc: RenderContext): RawButton[][] {
		const value = this.value(rc.manager);
		const row: RawButton[] = [];
		for (let i = 1; i <= this.max; i++)
			row.push({
				text: i <= value ? this.filled : this.empty,
				cb: { widgetId: this.opts.id, payload: String(i) },
			});
		return [row];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const star = Number.parseInt(payload, 10);
		if (Number.isNaN(star)) return true;
		// tapping the current rating again clears it back to 0
		const next = star === this.value(manager) ? 0 : clamp(star, 0, this.max);
		manager.setWidgetData(this.opts.id, next);
		await this.opts.onChanged?.(manager.clickCtx, next);
		return true;
	}
}

export function Rating(options: RatingOptions): Keyboard {
	return new RatingWidget(options);
}

/** Read a {@link Rating}'s current value from widget data. */
export function getRating(manager: DialogManager, id: string): number {
	return manager.widgetData<number>(id, 0);
}

// ───────────────────────── Slider ─────────────────────────

export interface SliderOptions {
	id: string;
	min?: number;
	max?: number;
	step?: number;
	default?: number;
	/** Track length in cells. Defaults to 10. */
	width?: number;
	/** Filled cell glyph. Defaults to `▰`. */
	fill?: string;
	/** Empty cell glyph. Defaults to `▱`. */
	empty?: string;
	/** Label on the track button — `(data) => …` gets `{ value }`. Defaults to the bar + value. */
	text?: TextSource;
	prevText?: TextSource;
	nextText?: TextSource;
	onChanged?: (ctx: ClickCtx, value: number) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A `‹ ▰▰▰▱▱ › ` stepper with a visual bar, storing a number in widget data. */
class SliderWidget extends KeyboardWidget {
	private readonly min: number;
	private readonly max: number;
	private readonly step: number;
	private readonly initial: number;
	private readonly width: number;
	private readonly fill: string;
	private readonly empty: string;
	private readonly text?: TextWidget;
	private readonly prev: TextWidget;
	private readonly next: TextWidget;

	constructor(private readonly opts: SliderOptions) {
		super(opts.when);
		this.min = opts.min ?? 0;
		this.max = opts.max ?? 10;
		this.step = opts.step ?? 1;
		this.initial = opts.default ?? this.min;
		this.width = opts.width ?? 10;
		this.fill = opts.fill ?? "▰";
		this.empty = opts.empty ?? "▱";
		this.text = opts.text === undefined ? undefined : asText(opts.text);
		this.prev = asText(opts.prevText ?? "‹");
		this.next = asText(opts.nextText ?? "›");
	}

	private value(manager: DialogManager): number {
		return clamp(
			manager.widgetData<number>(this.opts.id, this.initial),
			this.min,
			this.max,
		);
	}

	private bar(value: number): string {
		const ratio =
			this.max > this.min ? (value - this.min) / (this.max - this.min) : 0;
		const n = Math.round(clamp(ratio, 0, 1) * this.width);
		return this.fill.repeat(n) + this.empty.repeat(this.width - n);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const value = this.value(rc.manager);
		const label = this.text
			? String(
					await this.text.renderText({
						manager: rc.manager,
						data: { ...rc.data, value },
					}),
				)
			: `${this.bar(value)} ${value}`;
		const id = this.opts.id;
		return [
			[
				{
					text: String(await this.prev.renderText(rc)),
					cb: { widgetId: id, payload: "-" },
				},
				{ text: label, cb: { widgetId: id, payload: "=" } },
				{
					text: String(await this.next.renderText(rc)),
					cb: { widgetId: id, payload: "+" },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id) return false;
		if (payload !== "+" && payload !== "-") return true; // track tap: no-op
		const next = clamp(
			this.value(manager) + (payload === "+" ? this.step : -this.step),
			this.min,
			this.max,
		);
		if (next === this.value(manager)) return true; // already at the edge
		manager.setWidgetData(this.opts.id, next);
		await this.opts.onChanged?.(manager.clickCtx, next);
		return true;
	}
}

export function Slider(options: SliderOptions): Keyboard {
	return new SliderWidget(options);
}

/** Read a {@link Slider}'s current value from widget data. */
export function getSlider(manager: DialogManager, id: string): number {
	return manager.widgetData<number>(id, 0);
}

// ───────────────────────── Confirm ─────────────────────────

export interface ConfirmOptions {
	id: string;
	yesText?: TextSource;
	noText?: TextSource;
	onConfirm: (ctx: ClickCtx) => MaybePromise<unknown>;
	onCancel?: (ctx: ClickCtx) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A reusable `✅ / ❌` confirmation row. Stateless — fires `onConfirm`/`onCancel`. */
class ConfirmWidget extends KeyboardWidget {
	private readonly yes: TextWidget;
	private readonly no: TextWidget;

	constructor(private readonly opts: ConfirmOptions) {
		super(opts.when);
		this.yes = asText(opts.yesText ?? "✅ Yes");
		this.no = asText(opts.noText ?? "❌ No");
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const id = this.opts.id;
		return [
			[
				{
					text: String(await this.yes.renderText(rc)),
					cb: { widgetId: id, payload: "y" },
				},
				{
					text: String(await this.no.renderText(rc)),
					cb: { widgetId: id, payload: "n" },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id) return false;
		if (payload === "y") await this.opts.onConfirm(manager.clickCtx);
		else if (payload === "n") await this.opts.onCancel?.(manager.clickCtx);
		return true;
	}
}

export function Confirm(options: ConfirmOptions): Keyboard {
	return new ConfirmWidget(options);
}

// ───────────────────────── Stepper ─────────────────────────

export interface StepperOptions {
	/** Total number of steps, or an array of step labels. */
	steps: number | readonly string[];
	/** Current step (0-based) — a number or `(data) => number`. */
	current: number | ((data: DataDict) => number);
	doneGlyph?: string;
	currentGlyph?: string;
	todoGlyph?: string;
	sep?: string;
}

/** A progress indicator `●─●─○─○` (with optional labels). Display-only text widget. */
export function Stepper(options: StepperOptions): TextWidget {
	const labels = Array.isArray(options.steps) ? options.steps : undefined;
	const total =
		typeof options.steps === "number" ? options.steps : options.steps.length;
	const done = options.doneGlyph ?? "●";
	const cur = options.currentGlyph ?? "◉";
	const todo = options.todoGlyph ?? "○";
	const sep = options.sep ?? "─";
	return {
		renderText: (rc) => {
			const current =
				typeof options.current === "function"
					? options.current(rc.data)
					: options.current;
			const cells: string[] = [];
			for (let i = 0; i < total; i++) {
				const glyph = i < current ? done : i === current ? cur : todo;
				cells.push(labels?.[i] ? `${glyph} ${labels[i]}` : glyph);
			}
			return cells.join(sep);
		},
	};
}

// ───────────────────────── PinPad / OTP ─────────────────────────

export interface PinPadOptions {
	id: string;
	/** Number of digits. Defaults to 4. */
	length?: number;
	/** Hide entered digits as dots. Defaults to true. */
	masked?: boolean;
	maskGlyph?: string;
	emptyGlyph?: string;
	submitText?: string;
	backspaceText?: string;
	/** Fired when `length` digits are entered (also on the submit button). */
	onComplete: (ctx: ClickCtx, code: string) => MaybePromise<unknown>;
	onChange?: (ctx: ClickCtx, code: string) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A numeric keypad that builds a code (stored in widget data) and fires `onComplete`. */
class PinPadWidget extends KeyboardWidget {
	private readonly length: number;

	constructor(private readonly opts: PinPadOptions) {
		super(opts.when);
		this.length = opts.length ?? 4;
	}

	private code(manager: DialogManager): string {
		return manager.widgetData<string>(this.opts.id, "");
	}

	private display(code: string): string {
		const masked = this.opts.masked ?? true;
		const mask = this.opts.maskGlyph ?? "•";
		const empty = this.opts.emptyGlyph ?? "·";
		const shown = masked ? mask.repeat(code.length) : code;
		return (shown + empty.repeat(Math.max(0, this.length - code.length)))
			.split("")
			.join(" ");
	}

	protected render(rc: RenderContext): RawButton[][] {
		const id = this.opts.id;
		const digit = (d: string): RawButton => ({
			text: d,
			cb: { widgetId: id, payload: d },
		});
		return [
			[
				{
					text: this.display(this.code(rc.manager)),
					cb: { widgetId: id, payload: "x" },
				},
			],
			[digit("1"), digit("2"), digit("3")],
			[digit("4"), digit("5"), digit("6")],
			[digit("7"), digit("8"), digit("9")],
			[
				{
					text: this.opts.backspaceText ?? "⌫",
					cb: { widgetId: id, payload: "B" },
				},
				digit("0"),
				{
					text: this.opts.submitText ?? "✅",
					cb: { widgetId: id, payload: "S" },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		let code = this.code(manager);
		if (payload === "x") return true; // display tap
		if (payload === "B") code = code.slice(0, -1);
		else if (payload === "S") {
			if (code.length === this.length)
				await this.opts.onComplete(manager.clickCtx, code);
			return true;
		} else if (/^[0-9]$/.test(payload) && code.length < this.length)
			code += payload;
		else return true;

		manager.setWidgetData(this.opts.id, code);
		await this.opts.onChange?.(manager.clickCtx, code);
		if (code.length === this.length)
			await this.opts.onComplete(manager.clickCtx, code);
		return true;
	}
}

export function PinPad(options: PinPadOptions): Keyboard {
	return new PinPadWidget(options);
}

/** Read a {@link PinPad}'s current code from widget data. */
export function getPin(manager: DialogManager, id: string): string {
	return manager.widgetData<string>(id, "");
}

// ───────────────────────── TagInput ─────────────────────────

export interface TagInputOptions {
	id: string;
	default?: readonly string[];
	max?: number;
	/** Chips per row (re-wrap). Omit to keep one chip per row. */
	width?: number;
	removeIcon?: string;
	onChanged?: (ctx: ClickCtx, tags: string[]) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** Removable chips of tags (tap a chip to delete). Pair with `addTag` in `onMessage`. */
class TagInputWidget extends KeyboardWidget {
	constructor(private readonly opts: TagInputOptions) {
		super(opts.when);
	}

	private tags(manager: DialogManager): string[] {
		return manager.widgetData<string[]>(this.opts.id, [
			...(this.opts.default ?? []),
		]);
	}

	protected render(rc: RenderContext): RawButton[][] {
		const icon = this.opts.removeIcon ?? "❌";
		const id = this.opts.id;
		const chips: RawButton[] = this.tags(rc.manager).map((tag, i) => ({
			text: `${icon} ${tag}`,
			cb: { widgetId: id, payload: String(i) },
		}));
		return this.opts.width
			? chunk(chips, this.opts.width)
			: chips.map((c) => [c]);
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const index = Number.parseInt(payload, 10);
		const tags = this.tags(manager);
		if (!Number.isNaN(index) && index >= 0 && index < tags.length) {
			tags.splice(index, 1);
			manager.setWidgetData(this.opts.id, tags);
			await this.opts.onChanged?.(manager.clickCtx, [...tags]);
		}
		return true;
	}
}

export function TagInput(options: TagInputOptions): Keyboard {
	return new TagInputWidget(options);
}

/** Append a tag to a {@link TagInput} (e.g. from a window's `onMessage`). */
export function addTag(
	manager: DialogManager,
	id: string,
	tag: string,
	max?: number,
): string[] {
	const tags = manager.widgetData<string[]>(id, []);
	const value = tag.trim();
	if (
		value &&
		!tags.includes(value) &&
		(max === undefined || tags.length < max)
	)
		tags.push(value);
	manager.setWidgetData(id, tags);
	return [...tags];
}

/** Read a {@link TagInput}'s current tags from widget data. */
export function getTags(manager: DialogManager, id: string): string[] {
	return [...manager.widgetData<string[]>(id, [])];
}
