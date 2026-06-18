import { beforeEach, describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { Column } from "../src/widgets/group.ts";
import {
	Checkbox,
	Counter,
	Multiselect,
	Radio,
	Select,
} from "../src/widgets/stateful.ts";
import { Const, Format } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

interface Item {
	id: string;
}
const items: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

const dlg = new Dialog({
	id: "w",
	windows: [
		new Window({
			state: "main",
			text: Const("widgets"),
			getter: () => ({ items }),
			keyboard: Column([
				Counter({ id: "cnt", default: 0, min: 0, max: 3 }),
				Checkbox({
					id: "chk",
					checkedText: Const("on"),
					uncheckedText: Const("off"),
				}),
				Multiselect<Item>({
					id: "ms",
					items: (d) => d.items as Item[],
					itemId: (x) => x.id,
					checkedText: Format(({ item }) => `x${(item as Item).id}`),
					uncheckedText: Format(({ item }) => `o${(item as Item).id}`),
				}),
				Radio<Item>({
					id: "rd",
					items: (d) => d.items as Item[],
					itemId: (x) => x.id,
					checkedText: Format(({ item }) => `(*)${(item as Item).id}`),
					uncheckedText: Format(({ item }) => `( )${(item as Item).id}`),
				}),
				Select<Item>({
					id: "sel",
					items: (d) => d.items as Item[],
					itemId: (x) => x.id,
					text: Format(({ item }) => (item as Item).id),
					onClick: (c, id) => {
						c.dialog.data.picked = id;
						return c.answer();
					},
				}),
			]),
		}),
	],
});

describe("stateful widgets", () => {
	let h: ReturnType<typeof createHarness>;
	const wd = async () => (await h.load()).intents.at(-1)?.widgetData ?? {};
	const dd = async () => (await h.load()).intents.at(-1)?.data ?? {};

	beforeEach(async () => {
		h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("w");
	});

	it("Counter increments, decrements and clamps", async () => {
		await h.click("cnt", "+");
		await h.click("cnt", "+");
		expect((await wd()).cnt).toBe(2);
		expect(h.last().buttons[0]?.[1]?.text).toBe("2");
		await h.click("cnt", "+");
		await h.click("cnt", "+"); // beyond max 3 → clamps
		expect((await wd()).cnt).toBe(3);
		await h.click("cnt", "-");
		expect((await wd()).cnt).toBe(2);
	});

	it("Checkbox toggles a boolean", async () => {
		await h.click("chk");
		expect((await wd()).chk).toBe(true);
		await h.click("chk");
		expect((await wd()).chk).toBe(false);
	});

	it("Multiselect accumulates selected ids and reflects checks", async () => {
		await h.click("ms", "a");
		await h.click("ms", "c");
		expect((await wd()).ms).toEqual(["a", "c"]);
		const texts = h.flatTexts();
		expect(texts).toContain("xa");
		expect(texts).toContain("ob");
		await h.click("ms", "a"); // toggle off
		expect((await wd()).ms).toEqual(["c"]);
	});

	it("Radio keeps a single selection", async () => {
		await h.click("rd", "a");
		expect((await wd()).rd).toBe("a");
		await h.click("rd", "b");
		expect((await wd()).rd).toBe("b");
	});

	it("Select fires onClick with the item id", async () => {
		await h.click("sel", "c");
		expect((await dd()).picked).toBe("c");
	});
});
