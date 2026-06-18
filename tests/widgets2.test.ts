import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { DialogManager } from "../src/manager.ts";
import type { RenderContext } from "../src/types.ts";
import { Column } from "../src/widgets/group.ts";
import {
	CurrentPage,
	FirstPage,
	LastPage,
	NextPage,
	PrevPage,
} from "../src/widgets/scroll.ts";
import { Toggle } from "../src/widgets/stateful.ts";
import { Const, Format, Progress } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const dialog = new Dialog({
	id: "h",
	windows: [new Window({ state: "main", text: Const("x") })],
});

/** A live manager with an active context (for widgetData-backed widgets). */
async function manager(): Promise<{
	m: DialogManager;
	rc: (data?: Record<string, unknown>) => RenderContext;
}> {
	const h = createHarness([dialog]);
	await h.reset();
	const m = await h.managerFor(h.makeCtx("message"));
	await m.start("h");
	return { m, rc: (data = {}) => ({ data, manager: m }) };
}

describe("Progress", () => {
	it("renders a bar from a 0–100 value", async () => {
		const t = Progress({ value: () => 50, width: 10 });
		expect(await t.renderText({ data: {}, manager: undefined as never })).toBe(
			"█████░░░░░",
		);
		const full = Progress({ value: () => 100, width: 4 });
		expect(
			await full.renderText({ data: {}, manager: undefined as never }),
		).toBe("████");
	});
});

describe("Toggle", () => {
	it("cycles through static items and wraps", async () => {
		const items = [{ id: "rub" }, { id: "usd" }, { id: "eur" }];
		const t = Toggle<{ id: string }>({
			id: "cur",
			items,
			itemId: (x) => x.id,
			text: Format(({ item }) => (item as { id: string }).id),
		});
		const { m, rc } = await manager();
		expect((await t.renderKeyboard(rc()))[0]?.[0]?.text).toBe("rub");
		await t.processCallback("cur", undefined, m);
		expect((await t.renderKeyboard(rc()))[0]?.[0]?.text).toBe("usd");
		await t.processCallback("cur", undefined, m);
		await t.processCallback("cur", undefined, m);
		expect((await t.renderKeyboard(rc()))[0]?.[0]?.text).toBe("rub"); // wrapped
	});
});

describe("standalone pagers", () => {
	it("compute correct target pages from stored page-state", async () => {
		const { m, rc } = await manager();
		m.setWidgetData("sg", 1); // current page index 1
		m.setWidgetData("sg#pages", 5); // 5 pages total
		const payload = async (w: Awaited<ReturnType<typeof FirstPage>>) =>
			(await w.renderKeyboard(rc()))[0]?.[0]?.cb?.payload;
		expect(await payload(FirstPage({ scrollId: "sg" }))).toBe("0");
		expect(await payload(PrevPage({ scrollId: "sg" }))).toBe("0");
		expect(await payload(NextPage({ scrollId: "sg" }))).toBe("2");
		expect(await payload(LastPage({ scrollId: "sg" }))).toBe("4");
		expect(await CurrentPage("sg").renderText(rc())).toBe("2/5");
	});
});

describe("Group of new widgets composes", () => {
	it("Column accepts Toggle + pagers", async () => {
		const kb = Column([
			Toggle({
				id: "t",
				items: [{ id: "a" }],
				itemId: (x) => x.id,
				text: Const("a"),
			}),
			NextPage({ scrollId: "sg" }),
		]);
		const { rc } = await manager();
		const rows = await kb.renderKeyboard(rc());
		expect(rows.length).toBe(2);
	});
});
