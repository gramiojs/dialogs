import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { Tabs } from "../src/widgets/data.ts";
import { Slider } from "../src/widgets/forms.ts";
import { Column } from "../src/widgets/group.ts";
import { ScrollingGroup, pageState } from "../src/widgets/scroll.ts";
import { Checkbox, Counter, Multiselect } from "../src/widgets/stateful.ts";
import { Select } from "../src/widgets/stateful.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

// ────────────────────────────────────────────────────────────────────────────
// Counter edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("Counter – cyclic wrap", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ctr",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Counter({
						id: "c",
						min: 1,
						max: 3,
						default: 1,
						cyclic: true,
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ctr");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("wraps from max to min on increment", async () => {
		// start at 1, go to 3
		await h.click("c", "+");
		await h.click("c", "+");
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		expect((await wd()).c).toBe(3);
		// one more increment past max → wraps to min (1)
		await h.click("c", "+");
		expect((await wd()).c).toBe(1);
	});

	it("wraps from min to max on decrement", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		// start at 1 (min) → decrement wraps to max (3)
		await h.click("c", "-");
		expect((await wd()).c).toBe(3);
	});
});

describe("Counter – non-unit step", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ctr2",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Counter({ id: "c", min: 0, max: 10, default: 0, step: 3 }),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ctr2");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("increments by step size", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("c", "+");
		expect((await wd()).c).toBe(3);
		await h.click("c", "+");
		expect((await wd()).c).toBe(6);
	});

	it("decrements by step size", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("c", "+");
		await h.click("c", "+");
		await h.click("c", "-");
		expect((await wd()).c).toBe(3);
	});
});

describe("Counter – non-cyclic clamp", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ctr3",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Counter({
						id: "c",
						min: 0,
						max: 5,
						default: 0,
						cyclic: false,
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ctr3");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("clamps at min (does not go below 0)", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("c", "-");
		expect((await wd()).c).toBe(0);
	});

	it("clamps at max (does not go above 5)", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		for (let i = 0; i < 8; i++) await h.click("c", "+");
		expect((await wd()).c).toBe(5);
	});
});

describe("Counter – value-tap (= payload) is a no-op", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ctr4",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Counter({ id: "c", min: 0, max: 10, default: 5 }),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ctr4");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("tapping the value button does not change state", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		// The centre button sends payload "=" — which should be ignored
		await h.click("c", "=");
		// the default is persisted on first render; the value-tap leaves it unchanged
		expect((await wd()).c).toBe(5);
		// confirm the render still shows 5
		expect(h.last().buttons[0]?.[1]?.text).toBe("5");
	});
});

describe("Counter – onValueTap hook", () => {
	it("fires on a value-tap with the current value", async () => {
		const seen: number[] = [];
		const dlg = new Dialog({
			id: "ctr5",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Counter({
						id: "c",
						default: 5,
						onValueTap: (_ctx, value) => {
							seen.push(value);
						},
					}),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ctr5");

		await h.click("c", "+"); // 5 → 6
		await h.click("c", "="); // value tap → hook sees current value

		expect(seen).toEqual([6]);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Slider edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("Slider – clamp at bounds", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "sl",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Slider({ id: "s", min: 2, max: 6, default: 2 }),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("sl");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("does not go below min", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("s", "-");
		// already at min=2 → clamp leaves the value unchanged (default persisted on render)
		expect((await wd()).s).toBe(2);
		expect(h.last().buttons[0]?.[1]?.text).toContain("2");
	});

	it("does not go above max", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		for (let i = 0; i < 10; i++) await h.click("s", "+");
		expect((await wd()).s).toBe(6);
	});

	it("track-tap (= payload) is a no-op", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("s", "=");
		// track tap is a no-op; the value stays at its default
		expect((await wd()).s).toBe(2);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Multiselect – max-cap and basic toggle
// ────────────────────────────────────────────────────────────────────────────

describe("Multiselect – max cap", () => {
	type Item = { id: string };
	const items: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ms",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					getter: () => ({ items }),
					keyboard: Multiselect<Item>({
						id: "ms",
						items: (d) => d.items as Item[],
						itemId: (x) => x.id,
						checkedText: (s) => `[${(s.item as Item).id}]`,
						uncheckedText: (s) => (s.item as Item).id,
						max: 2,
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ms");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("refuses to select a third item when max=2", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("ms", "a");
		await h.click("ms", "b");
		await h.click("ms", "c"); // should be ignored
		expect((await wd()).ms).toEqual(["a", "b"]);
	});

	it("allows deselect even when at cap", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		await h.click("ms", "a");
		await h.click("ms", "b");
		await h.click("ms", "a"); // deselect
		expect((await wd()).ms).toEqual(["b"]);
	});
});

describe("Multiselect – basic toggle via engine", () => {
	type Item = { id: string };
	const items: Item[] = [{ id: "x" }, { id: "y" }];

	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "ms2",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					getter: () => ({ items }),
					keyboard: Multiselect<Item>({
						id: "ms2",
						items: (d) => d.items as Item[],
						itemId: (item) => item.id,
						checkedText: (s) => `✓${(s.item as Item).id}`,
						uncheckedText: (s) => (s.item as Item).id,
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("ms2");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("toggles an item on then off", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		expect(h.flatTexts()).toEqual(["x", "y"]);
		await h.click("ms2", "x");
		expect(h.flatTexts()).toContain("✓x");
		expect((await wd()).ms2).toEqual(["x"]);
		await h.click("ms2", "x");
		expect(h.flatTexts()).not.toContain("✓x");
		expect((await wd()).ms2).toEqual([]);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Checkbox – basic toggle via engine
// ────────────────────────────────────────────────────────────────────────────

describe("Checkbox – toggle via engine", () => {
	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "chk",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Checkbox({
						id: "chk",
						checkedText: "ON",
						uncheckedText: "OFF",
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("chk");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("starts unchecked, toggles on and off", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		expect(h.flatTexts()).toEqual(["OFF"]);
		await h.click("chk");
		expect(h.flatTexts()).toEqual(["ON"]);
		expect((await wd()).chk).toBe(true);
		await h.click("chk");
		expect(h.flatTexts()).toEqual(["OFF"]);
		expect((await wd()).chk).toBe(false);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// ScrollingGroup – tapping the current-page indicator is a no-op
// ────────────────────────────────────────────────────────────────────────────

describe("ScrollingGroup – page indicator tap is a no-op", () => {
	type Item = { id: string; label: string };
	const items: Item[] = [
		{ id: "1", label: "A" },
		{ id: "2", label: "B" },
		{ id: "3", label: "C" },
		{ id: "4", label: "D" },
		{ id: "5", label: "E" },
	];

	let h: ReturnType<typeof createHarness>;

	beforeEach(async () => {
		const dlg = new Dialog({
			id: "sg",
			windows: [
				new Window({
					state: "m",
					text: Const("list"),
					getter: () => ({ items }),
					keyboard: ScrollingGroup(
						[
							Select<Item>({
								id: "sel",
								items: (d) => d.items as Item[],
								itemId: (x) => x.id,
								text: (s) => (s.item as Item).label,
								onClick: () => undefined,
							}),
						],
						{ id: "sg", height: 2 },
					),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("sg");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("tapping the current page indicator does not change page", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		// Page indicator is the centre pager button — it carries payload=String(page)=String(0)
		// so tapping it clicks the sg widget with payload "0" while page is already 0 → no-op
		const pageBefore = (await wd()).sg ?? 0;
		// Navigate to page 1 first so we know pager is rendering
		await h.click("sg", "1");
		expect((await wd()).sg).toBe(1);
		// Now tap the current page indicator (payload = "1" = current page)
		await h.click("sg", "1"); // same page → no-op
		expect((await wd()).sg).toBe(1);
		// Verify page 0 indicator likewise
		await h.click("sg", "0");
		await h.click("sg", "0"); // already page 0 → no-op
		expect((await wd()).sg).toBe(0);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Tabs – tapping the current tab is a no-op
// ────────────────────────────────────────────────────────────────────────────

describe("Tabs – tapping the active tab is a no-op", () => {
	let h: ReturnType<typeof createHarness>;
	const changed: string[] = [];

	beforeEach(async () => {
		changed.length = 0;
		const dlg = new Dialog({
			id: "tabs",
			windows: [
				new Window({
					state: "m",
					text: Const("x"),
					keyboard: Tabs({
						id: "tabs",
						items: [
							{ id: "one", label: "One" },
							{ id: "two", label: "Two" },
							{ id: "three", label: "Three" },
						],
						default: "one",
						onChanged: (_ctx, id) => {
							changed.push(id);
						},
					}),
				}),
			],
		});
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("tabs");
	});

	afterEach(async () => {
		await h.reset();
	});

	it("does not fire onChanged when tapping the already-active tab", async () => {
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		// active tab is "one" by default
		await h.click("tabs", "one"); // same tab → no-op
		expect(changed).toEqual([]); // onChanged must NOT have fired
		// widgetData may or may not be written, but value stays "one"
		const tabVal = (await wd()).tabs as string | undefined;
		expect(tabVal === undefined || tabVal === "one").toBe(true);
	});

	it("fires onChanged when switching to a different tab", async () => {
		await h.click("tabs", "two");
		expect(changed).toEqual(["two"]);
		await h.click("tabs", "two"); // same tab again → no-op
		expect(changed).toEqual(["two"]);
		await h.click("tabs", "three");
		expect(changed).toEqual(["two", "three"]);
	});
});
