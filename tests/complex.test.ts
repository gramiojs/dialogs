import { beforeEach, describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { Column } from "../src/widgets/group.ts";
import { ListGroup } from "../src/widgets/list.ts";
import { ScrollingGroup } from "../src/widgets/scroll.ts";
import { Checkbox, Select } from "../src/widgets/stateful.ts";
import { Const, Format } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

let clickedRow: string | undefined;

interface Row {
	id: number;
}
interface Task {
	id: string;
}

const dlg = new Dialog({
	id: "x",
	windows: [
		new Window({
			state: "scroll",
			text: Const("scroll"),
			getter: () => ({
				rows: Array.from({ length: 25 }, (_, i) => ({ id: i })),
			}),
			keyboard: Column([
				ScrollingGroup(
					[
						Select<Row>({
							id: "pick",
							items: (d) => d.rows as Row[],
							itemId: (r) => r.id,
							text: Format(({ item }) => `#${(item as Row).id}`),
							onClick: (ctx, id) => {
								clickedRow = id;
								return ctx.answer();
							},
						}),
					],
					{ id: "scroll", height: 5 },
				),
			]),
		}),
		new Window({
			state: "listgroup",
			text: Const("lg"),
			getter: () => ({ tasks: [{ id: "x" }, { id: "y" }] }),
			keyboard: Column([
				ListGroup<Task>({
					id: "lg",
					items: (d) => d.tasks as Task[],
					itemId: (t) => t.id,
					widgets: [
						Checkbox({
							id: "chk",
							checkedText: Format(({ itemId }) => `✅ ${itemId}`),
							uncheckedText: Format(({ itemId }) => `⬜ ${itemId}`),
						}),
					],
				}),
			]),
		}),
	],
});

describe("ScrollingGroup", () => {
	let h: ReturnType<typeof createHarness>;
	beforeEach(async () => {
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("x", "scroll");
	});

	it("paginates a long list", async () => {
		expect(h.flatTexts()).toContain("1/5");
		expect(h.flatTexts()).toContain("#0");
		expect(h.flatTexts()).not.toContain("#5");
		await h.click("scroll", "1");
		expect(h.flatTexts()).toContain("#5");
		expect(h.flatTexts()).toContain("2/5");
	});

	it("routes item clicks inside the group", async () => {
		await h.click("pick", "7");
		expect(clickedRow).toBe("7");
	});
});

describe("ListGroup", () => {
	let h: ReturnType<typeof createHarness>;
	beforeEach(async () => {
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("x", "listgroup");
	});

	it("isolates per-item widget state", async () => {
		expect(h.flatTexts()).toEqual(["⬜ x", "⬜ y"]);
		await h.click("lg", "x~chk~");
		expect(h.flatTexts()).toEqual(["✅ x", "⬜ y"]);
		expect((await h.load()).intents.at(-1)?.widgetData["lg#x/chk"]).toBe(true);
	});
});
