import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	Stringable,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";

type Scope = "days" | "months" | "years";

interface CalState {
	scope: Scope;
	year: number;
	month: number; // 0–11
}

export interface CalendarOptions {
	id: string;
	/** Called when a day is picked. Receives a UTC-midnight `Date`. */
	onSelect: (ctx: ClickCtx, date: Date) => MaybePromise<unknown>;
	/** 12 month names (Jan…Dec). */
	monthNames?: string[];
	/** 7 weekday names, Monday first. */
	weekdayNames?: string[];
	/** Earliest selectable day (inclusive). Out-of-range days are not clickable. */
	minDate?: Date;
	/** Latest selectable day (inclusive). */
	maxDate?: Date;
	/**
	 * Decorate individual day cells (custom-view): return a replacement label for
	 * a given day (e.g. `🔵5` for today/holidays/the selected date), or
	 * `undefined` to keep the default. Only applied to in-range (clickable) days.
	 * Receives the UTC-midnight `Date` and the {@link RenderContext}, so it can
	 * highlight per-user state — e.g. read `rc.data.dialogData` for the picked day.
	 */
	marks?: (date: Date, rc: RenderContext) => Stringable | undefined;
	when?: WhenCondition;
}

const DEFAULT_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const DEFAULT_WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const NOOP = "z";

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Weekday of the 1st (0 = Monday … 6 = Sunday). */
function firstWeekday(year: number, month: number): number {
	const js = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
	return (js + 6) % 7;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** Day/month/year drill-down date picker (aiogram_dialog `Calendar`). */
class CalendarWidget extends KeyboardWidget {
	private readonly months: string[];
	private readonly weekdays: string[];

	constructor(private readonly opts: CalendarOptions) {
		super(opts.when);
		this.months = opts.monthNames ?? DEFAULT_MONTHS;
		this.weekdays = opts.weekdayNames ?? DEFAULT_WEEKDAYS;
	}

	/** Month label, falling back to the default if a short array was supplied. */
	private monthName(index: number): string {
		return this.months[index] ?? DEFAULT_MONTHS[index] ?? String(index + 1);
	}

	/** Weekday label, falling back to the default if a short array was supplied. */
	private weekdayName(index: number): string {
		return this.weekdays[index] ?? DEFAULT_WEEKDAYS[index] ?? "";
	}

	private state(manager: DialogManager): CalState {
		const now = new Date();
		return manager.widgetData<CalState>(this.opts.id, {
			scope: "days",
			year: now.getUTCFullYear(),
			month: now.getUTCMonth(),
		});
	}

	private btn(text: string, payload: string): RawButton {
		return { text, cb: { widgetId: this.opts.id, payload } };
	}

	private inRange(year: number, month: number, day: number): boolean {
		const t = Date.UTC(year, month, day);
		const { minDate, maxDate } = this.opts;
		if (
			minDate &&
			t <
				Date.UTC(
					minDate.getUTCFullYear(),
					minDate.getUTCMonth(),
					minDate.getUTCDate(),
				)
		)
			return false;
		if (
			maxDate &&
			t >
				Date.UTC(
					maxDate.getUTCFullYear(),
					maxDate.getUTCMonth(),
					maxDate.getUTCDate(),
				)
		)
			return false;
		return true;
	}

	protected render(rc: RenderContext): RawButton[][] {
		const st = this.state(rc.manager);
		if (st.scope === "months") return this.renderMonths(st);
		if (st.scope === "years") return this.renderYears(st);
		return this.renderDays(st, rc);
	}

	private renderDays(st: CalState, rc: RenderContext): RawButton[][] {
		const rows: RawButton[][] = [];
		rows.push([
			this.btn("‹", "PM"),
			this.btn(`${this.monthName(st.month)} ${st.year}`, "SM"),
			this.btn("›", "NM"),
		]);
		rows.push(
			Array.from({ length: 7 }, (_, i) => this.btn(this.weekdayName(i), NOOP)),
		);

		const lead = firstWeekday(st.year, st.month);
		const total = daysInMonth(st.year, st.month);
		let row: RawButton[] = [];
		for (let i = 0; i < lead; i++) row.push(this.btn(" ", NOOP));
		for (let day = 1; day <= total; day++) {
			const iso = `${st.year}-${pad2(st.month + 1)}-${pad2(day)}`;
			const inRange = this.inRange(st.year, st.month, day);
			// out-of-range days show in brackets and aren't clickable
			if (inRange) {
				const mark = this.opts.marks?.(
					new Date(Date.UTC(st.year, st.month, day)),
					rc,
				);
				row.push(
					this.btn(mark !== undefined ? String(mark) : String(day), `D${iso}`),
				);
			} else {
				row.push(this.btn(`·${day}·`, NOOP));
			}
			if (row.length === 7) {
				rows.push(row);
				row = [];
			}
		}
		if (row.length > 0) {
			while (row.length < 7) row.push(this.btn(" ", NOOP));
			rows.push(row);
		}
		return rows;
	}

	private renderMonths(st: CalState): RawButton[][] {
		const rows: RawButton[][] = [
			[
				this.btn("‹", "PY"),
				this.btn(String(st.year), "SY"),
				this.btn("›", "NY"),
			],
		];
		let row: RawButton[] = [];
		for (let m = 0; m < 12; m++) {
			row.push(this.btn(this.monthName(m), `M${m}`));
			if (row.length === 3) {
				rows.push(row);
				row = [];
			}
		}
		return rows;
	}

	private renderYears(st: CalState): RawButton[][] {
		const base = st.year - 5;
		const rows: RawButton[][] = [
			[
				this.btn("‹", "PR"),
				this.btn(`${base}–${base + 11}`, NOOP),
				this.btn("›", "NR"),
			],
		];
		let row: RawButton[] = [];
		for (let i = 0; i < 12; i++) {
			const year = base + i;
			row.push(this.btn(String(year), `Y${year}`));
			if (row.length === 3) {
				rows.push(row);
				row = [];
			}
		}
		return rows;
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const st = { ...this.state(manager) };

		if (payload === NOOP) return true;
		if (payload === "PM") this.shiftMonth(st, -1);
		else if (payload === "NM") this.shiftMonth(st, 1);
		else if (payload === "SM") st.scope = "months";
		else if (payload === "SY") st.scope = "years";
		else if (payload === "PY") st.year -= 1;
		else if (payload === "NY") st.year += 1;
		else if (payload === "PR") st.year -= 12;
		else if (payload === "NR") st.year += 12;
		else if (payload.startsWith("M")) {
			st.month = Number.parseInt(payload.slice(1), 10);
			st.scope = "days";
		} else if (payload.startsWith("Y")) {
			st.year = Number.parseInt(payload.slice(1), 10);
			st.scope = "months";
		} else if (payload.startsWith("D")) {
			const date = new Date(`${payload.slice(1)}T00:00:00.000Z`);
			manager.setWidgetData(this.opts.id, st);
			await this.opts.onSelect(manager.clickCtx, date);
			return true;
		}

		manager.setWidgetData(this.opts.id, st);
		return true;
	}

	private shiftMonth(st: CalState, delta: 1 | -1): void {
		st.month += delta;
		if (st.month < 0) {
			st.month = 11;
			st.year -= 1;
		} else if (st.month > 11) {
			st.month = 0;
			st.year += 1;
		}
	}
}

export function Calendar(options: CalendarOptions): Keyboard {
	return new CalendarWidget(options);
}
