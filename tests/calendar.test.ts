import { describe, expect, it } from "bun:test";
import { Calendar, Column, Dialog, Window } from "../src/index.ts";
import type { DialogManager } from "../src/manager.ts";
import type { RenderContext } from "../src/types.ts";
import { createHarness } from "./helpers.ts";

// Calendar widget — consolidated from the former complex / widgets2 /
// calendar-marks files. Tests that depend on the *displayed* month pin it
// deterministically by clicking Y2026 then M5 (payload-driven, so they do NOT
// rely on the system clock — the old calendar-marks file did and would have
// broken once "today" left June 2026).

interface CalOpts {
	onSelect?: (date: Date) => void;
	marks?: (date: Date, rc: RenderContext) => string | undefined;
	minDate?: Date;
	maxDate?: Date;
	monthNames?: string[];
	weekdayNames?: string[];
}

function calendarDialog(opts: CalOpts = {}) {
	const cal = Calendar({
		id: "cal",
		onSelect: (_ctx, date) => opts.onSelect?.(date),
		marks: opts.marks,
		minDate: opts.minDate,
		maxDate: opts.maxDate,
		monthNames: opts.monthNames,
		weekdayNames: opts.weekdayNames,
	});
	return new Dialog({
		id: "c",
		windows: [
			new Window({ state: "m", text: "pick", keyboard: Column([cal]) }),
		],
	});
}

/** Navigate the calendar to a fixed month, independent of the system clock. */
async function pin(
	h: ReturnType<typeof createHarness>,
	year: number,
	monthIndex: number,
) {
	await h.click("cal", `Y${year}`); // → months view, chosen year
	await h.click("cal", `M${monthIndex}`); // → days view, chosen month
}

/** A live manager with an active context, for unit-rendering widgetData widgets. */
async function manager(): Promise<{
	m: DialogManager;
	rc: (data?: Record<string, unknown>) => RenderContext;
}> {
	const h = createHarness([
		new Dialog({
			id: "h",
			windows: [new Window({ state: "main", text: "x" })],
		}),
	]);
	await h.reset();
	const m = await h.managerFor(h.makeCtx("message"));
	await m.start("h");
	return { m, rc: (data = {}) => ({ data, manager: m }) };
}

describe("Calendar — days view & drill-down", () => {
	it("renders a Monday-first weekday header", async () => {
		const h = createHarness([calendarDialog()]);
		await h.reset();
		await h.start("c");
		const texts = h.flatTexts();
		expect(texts).toContain("Mo");
		expect(texts).toContain("Su");
	});

	it("drills into the month picker and selects a day", async () => {
		let picked: Date | undefined;
		const h = createHarness([
			calendarDialog({
				onSelect: (d) => {
					picked = d;
				},
			}),
		]);
		await h.reset();
		await h.start("c");

		await h.click("cal", "SM");
		expect(h.flatTexts()).toContain("Jan");
		expect(h.flatTexts()).toContain("Dec");

		// day select is payload-driven and works regardless of the shown month
		await h.click("cal", "D2026-06-15");
		expect(picked?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
	});

	it("drills through the year picker into a chosen month", async () => {
		const thisYear = new Date().getUTCFullYear();
		const h = createHarness([calendarDialog()]);
		await h.reset();
		await h.start("c");

		await h.click("cal", "SM"); // months view
		await h.click("cal", "SY"); // years view
		expect(h.flatTexts()).toContain(String(thisYear)); // grid centred on now

		await h.click("cal", `Y${thisYear}`); // pick year → months
		await h.click("cal", "M5"); // pick June → days
		expect(h.flatTexts()).toContain(`Jun ${thisYear}`);
	});

	it("rolls the year over at the month boundaries", async () => {
		const h = createHarness([calendarDialog()]);
		await h.reset();
		await h.start("c");

		await pin(h, 2026, 0); // January 2026
		await h.click("cal", "PM"); // ‹ previous month
		expect(h.flatTexts()).toContain("Dec 2025");

		await pin(h, 2026, 11); // December 2026
		await h.click("cal", "NM"); // › next month
		expect(h.flatTexts()).toContain("Jan 2027");
	});
});

describe("Calendar — marks", () => {
	it("decorates marked day cells, leaving others default", async () => {
		const h = createHarness([
			calendarDialog({
				marks: (date) =>
					date.getUTCDate() === 15 ? `•${date.getUTCDate()}` : undefined,
			}),
		]);
		await h.reset();
		await h.start("c");
		await pin(h, 2026, 5); // June 2026

		const labels = h.flatTexts();
		expect(labels).toContain("•15"); // marked
		expect(labels).not.toContain("15"); // replaced
		expect(labels).toContain("14"); // unmarked stays plain
	});

	it("never renders undefined labels when given short name arrays", async () => {
		const h = createHarness([
			calendarDialog({ monthNames: ["Jan"], weekdayNames: ["Mo"] }),
		]);
		await h.reset();
		await h.start("c");
		await h.click("cal", "SM"); // month picker reads all 12 labels

		const labels = h.flatTexts();
		expect(labels).not.toContain("undefined");
		for (const l of labels) expect(typeof l).toBe("string");
	});

	it("highlights the picked day via marks reading dialogData (auto re-render)", async () => {
		const cal = Calendar({
			id: "cal",
			marks: (date, rc) =>
				date.toISOString().slice(0, 10) ===
				(rc.data.dialogData as { picked?: string }).picked
					? `⭐${date.getUTCDate()}`
					: undefined,
			onSelect: (ctx, date) => {
				(ctx.dialogData as { picked?: string }).picked = date
					.toISOString()
					.slice(0, 10);
			},
		});
		const h = createHarness([
			new Dialog({
				id: "cs",
				windows: [
					new Window({ state: "m", text: "pick", keyboard: Column([cal]) }),
				],
			}),
		]);
		await h.reset();
		await h.start("cs");
		await pin(h, 2026, 5); // June 2026, deterministically

		expect(h.flatTexts()).toContain("20"); // plain before selecting
		await h.click("cal", "D2026-06-20");
		// onSelect wrote dialogData → engine auto re-renders → ⭐ now shows
		expect(h.flatTexts()).toContain("⭐20");
		expect(h.flatTexts()).not.toContain("20");
	});
});

describe("Calendar — min/max bounds", () => {
	it("disables days after maxDate", async () => {
		const cal = Calendar({
			id: "cal",
			onSelect: () => undefined,
			maxDate: new Date("2026-06-10T00:00:00Z"),
		});
		const { m, rc } = await manager();
		m.setWidgetData("cal", { scope: "days", year: 2026, month: 5 });
		const texts = (await cal.renderKeyboard(rc())).flat().map((b) => b.text);
		expect(texts).toContain("10"); // in range, clickable
		expect(texts).toContain("·11·"); // out of range, disabled style
		expect(texts).not.toContain("11");
	});

	it("disables days before minDate", async () => {
		const cal = Calendar({
			id: "cal",
			onSelect: () => undefined,
			minDate: new Date("2026-06-10T00:00:00Z"),
		});
		const { m, rc } = await manager();
		m.setWidgetData("cal", { scope: "days", year: 2026, month: 5 });
		const texts = (await cal.renderKeyboard(rc())).flat().map((b) => b.text);
		expect(texts).toContain("·9·"); // out of range, disabled style
		expect(texts).not.toContain("9");
		expect(texts).toContain("10"); // lower bound is inclusive
	});

	it("clips both bounds within the same month", async () => {
		const cal = Calendar({
			id: "cal",
			onSelect: () => undefined,
			minDate: new Date("2026-06-10T00:00:00Z"),
			maxDate: new Date("2026-06-20T00:00:00Z"),
		});
		const { m, rc } = await manager();
		m.setWidgetData("cal", { scope: "days", year: 2026, month: 5 });
		const texts = (await cal.renderKeyboard(rc())).flat().map((b) => b.text);
		expect(texts).toContain("·9·");
		expect(texts).toContain("·21·");
		expect(texts).toContain("15"); // mid-range stays clickable
	});
});
