import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { Keyboard } from "../src/types.ts";
import { Button, SwitchTo } from "../src/widgets/button.ts";
import {
	Accordion,
	AsyncSelect,
	Breadcrumbs,
	Grid,
	Tabs,
	getTab,
} from "../src/widgets/data.ts";
import { Column } from "../src/widgets/group.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const single = (keyboard: Keyboard, id = "d") =>
	new Dialog({
		id,
		windows: [new Window({ state: "m", text: "x", keyboard })],
	});

describe("Tabs", () => {
	it("switches the active tab", async () => {
		const h = createHarness([
			single(
				Tabs({
					id: "tab",
					items: [
						{ id: "a", label: "A" },
						{ id: "b", label: "B" },
					],
				}),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual(["«A»", "B"]);

		await h.click("tab", "b");
		expect(h.flatTexts()).toEqual(["A", "«B»"]);
		const m = await h.managerFor(h.makeCtx("callback_query"));
		expect(getTab(m, "tab")).toBe("b");
	});
});

describe("Grid", () => {
	it("lays items out in rows of `width` and fires onClick", async () => {
		let picked = "";
		const h = createHarness([
			single(
				Grid<{ id: number }>({
					id: "g",
					items: () => [1, 2, 3, 4, 5].map((id) => ({ id })),
					itemId: (i) => i.id,
					text: (i) => `#${i.id}`,
					width: 2,
					onClick: (_c, id) => {
						picked = id;
					},
				}),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.last().buttons.length).toBe(3); // 2 + 2 + 1
		expect(h.flatTexts()).toEqual(["#1", "#2", "#3", "#4", "#5"]);

		await h.click("g", "3");
		expect(picked).toBe("3");
	});
});

describe("Accordion", () => {
	it("expands/collapses sections and delegates to the body", async () => {
		let innerHit = false;
		const body = Column([
			Button("inner", {
				id: "inner",
				onClick: () => {
					innerHit = true;
				},
			}),
		]);
		const h = createHarness([
			single(
				Accordion({
					id: "acc",
					sections: [{ id: "s1", header: "Sec 1", body }],
				}),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual(["▶ Sec 1"]);

		await h.click("acc", "h0"); // expand
		expect(h.flatTexts()).toEqual(["▼ Sec 1", "inner"]);

		await h.click("inner"); // delegated to body
		expect(innerHit).toBe(true);

		await h.click("acc", "h0"); // collapse
		expect(h.flatTexts()).toEqual(["▶ Sec 1"]);
	});
});

describe("Breadcrumbs", () => {
	it("renders the visited-state trail", async () => {
		const labels = { home: "Home", settings: "Settings" };
		const dialog = new Dialog("bc")
			.window("home", {
				text: Breadcrumbs({ labels }),
				keyboard: Column([SwitchTo("go", "settings", { id: "go" })]),
			})
			.window("settings", { text: Breadcrumbs({ labels }) });
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("bc");
		expect(h.last().text).toBe("Home");

		await h.click("go");
		expect(h.last().text).toBe("Home › Settings");
	});
});

describe("AsyncSelect", () => {
	it("paginates and fires onClick", async () => {
		let picked = "";
		const all = Array.from({ length: 12 }, (_, i) => ({
			id: i,
			name: `item${i}`,
		}));
		const h = createHarness([
			single(
				AsyncSelect<{ id: number; name: string }>({
					id: "as",
					pageSize: 5,
					load: ({ offset, limit }) => all.slice(offset, offset + limit),
					itemId: (i) => i.id,
					text: (i) => i.name,
					onClick: (_c, id) => {
						picked = id;
					},
				}),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual([
			"item0",
			"item1",
			"item2",
			"item3",
			"item4",
			"Next ›",
		]);

		await h.click("as", ">"); // page 2
		expect(h.flatTexts().slice(0, 5)).toEqual([
			"item5",
			"item6",
			"item7",
			"item8",
			"item9",
		]);
		expect(h.flatTexts()).toContain("‹ Prev");

		await h.click("as", "i7");
		expect(picked).toBe("7");
	});
});
