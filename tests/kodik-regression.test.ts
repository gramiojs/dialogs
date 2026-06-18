import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { ShowMode } from "../src/types.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { ScrollingGroup } from "../src/widgets/scroll.ts";
import { Select } from "../src/widgets/stateful.ts";
import { Const, Format } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

interface Item {
	index: number;
	title: string;
}

const longTitles = Array.from({ length: 30 }, (_, i) => ({
	index: i,
	title: `Привет, очень длинное название аниме номер ${i + 1} ещё немного текста`,
}));

const dlg = new Dialog({
	id: "k",
	windows: [
		new Window({
			state: "search",
			text: Const("ask"),
			onMessage: async (ctx) => {
				ctx.dialog.data.query = ctx.text;
				await ctx.dialog.switchTo("results", ShowMode.Send);
			},
		}),
		new Window({
			state: "results",
			text: Const("results"),
			getter: () => ({ items: longTitles }),
			keyboard: Column([
				ScrollingGroup(
					[
						Select<Item>({
							id: "title",
							items: (d) => d.items as Item[],
							itemId: (x) => x.index, // index, NOT the long title
							text: Format(({ item }) => (item as Item).title),
							onClick: (c) => c.answer(),
						}),
					],
					{ id: "sg", height: 6 },
				),
				Button({
					text: Const("again"),
					id: "again",
					onClick: (c) => c.dialog.switchTo("search"),
				}),
				Button({
					text: Const("close"),
					id: "close",
					onClick: async (ctx) => {
						await ctx.message?.delete().catch(() => undefined);
						await ctx.dialog.done();
					},
				}),
			]),
		}),
	],
});

describe("callback_data size & results-window nav (kodik regression)", () => {
	const enc = new TextEncoder();

	it("keeps every callback_data within Telegram's 64-byte limit", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("k", "search");
		await h.sendText("hello"); // → results (Send)

		const sizes = h
			.last()
			.buttons.flat()
			.map((b) => enc.encode(b.data).length);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(64);
	});

	it("'again' switches back to the search window", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("k", "search");
		await h.sendText("hello");
		await h.click("again");
		expect(h.last().text).toBe("ask");
	});

	it("'close' deletes the message and empties the stack", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("k", "search");
		await h.sendText("hello");
		const before = h.log.length;
		await h.click("close");
		expect(h.log.slice(before).some((e) => e.kind === "delete")).toBe(true);
		expect((await h.load()).intents.length).toBe(0);
	});
});
