import { beforeEach, describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import {
	Back,
	Button,
	Cancel,
	Start,
	SwitchTo,
} from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Select } from "../src/widgets/stateful.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

describe("bare-string & function text (auto-Const)", () => {
	it("accepts a string, a function, and a TextWidget", async () => {
		const d = new Dialog("t").window("main", {
			getter: () => ({ name: "Lina" }),
			text: (data) => `hi ${data.name}`, // typed function text
			keyboard: Column([Button("Plain", { id: "b" })]), // bare-string label
		});
		const h = createHarness([d]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("t");
		expect(h.last().text).toBe("hi Lina");
		expect(h.flatTexts()).toEqual(["Plain"]);
	});

	it("plain string window text", async () => {
		const d = new Dialog("t2").window("main", { text: "just text" });
		const h = createHarness([d]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("t2");
		expect(h.last().text).toBe("just text");
	});
});

describe("positional widget overloads", () => {
	const d = new Dialog("p")
		.window("menu", {
			text: "menu",
			keyboard: Column([
				SwitchTo("➡ Go", "second"),
				Start("🚀 Child", "child"),
				Cancel("✖ Close"),
			]),
		})
		.window("second", { text: "second", keyboard: Column([Back("◀ Back")]) });

	it("renders positional labels and navigates", async () => {
		const child = new Dialog("child").window("main", { text: "child" });
		const h = createHarness([d, child]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("p");
		expect(h.flatTexts()).toEqual(["➡ Go", "🚀 Child", "✖ Close"]);
		await h.click("switch_0"); // auto-derived id for the first SwitchTo
	});
});

describe("flat ctx.* navigation", () => {
	const d = new Dialog("f")
		.window("menu", {
			text: "menu",
			keyboard: Column([
				Button("set+go", {
					id: "go",
					onClick: (ctx) => {
						ctx.dialogData.flag = true; // flat dialog data
						return ctx.switchTo("other"); // flat nav
					},
				}),
			]),
		})
		.window("other", { text: "other" });

	it("ctx.switchTo + ctx.dialogData work in handlers", async () => {
		const h = createHarness([d]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("f");
		await h.click("go");
		expect(h.last().text).toBe("other");
		expect((await h.load()).intents.at(-1)?.data.flag).toBe(true);
	});
});

describe("history-based back()", () => {
	const d = new Dialog("h")
		.window("a", { text: "A" })
		.window("b", { text: "B" })
		.window("c", { text: "C" });

	it("back() returns to the actually-visited previous window", async () => {
		const h = createHarness([d]);
		await h.reset();
		const m = await h.managerFor(h.makeCtx("message"));
		await m.start("h", "a");
		await m.switchTo("b");
		await m.switchTo("c");
		await m.back();
		expect(h.last().text).toBe("B"); // not declaration-order, real history
		await m.back();
		expect(h.last().text).toBe("A");
	});
});

describe("typed ctx.params (Dialog<Params>)", () => {
	const d = new Dialog<{ name: string }>("params").window("main", {
		getter: (ctx) => ({ greeting: `hi ${ctx.params.name}` }), // ctx.params typed
		text: (data) => data.greeting,
	});
	new Dialog<{ name: string }>("x").window("m", {
		// @ts-expect-error — `missing` not on Params, proving ctx.params is typed
		getter: (ctx) => ({ z: ctx.params.missing }),
	});

	it("passes typed params through start()", async () => {
		const h = createHarness([d]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start(
			"params",
			undefined,
			{ data: { name: "Lina" } },
		);
		expect(h.last().text).toBe("hi Lina");
	});
});

describe("typed per-item text", () => {
	it("Select text callback gets a typed item", async () => {
		interface Row {
			id: string;
			title: string;
		}
		const d = new Dialog("sel").window("main", {
			text: "pick",
			getter: () => ({ rows: [{ id: "1", title: "Alpha" }] as Row[] }),
			keyboard: Column([
				Select<Row>({
					id: "row",
					items: (data) => data.rows as Row[],
					itemId: (r) => r.id,
					text: (s) => s.item.title, // s.item typed as Row
					onClick: (ctx) => ctx.answer(),
				}),
			]),
		});
		const h = createHarness([d]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("sel");
		expect(h.flatTexts()).toContain("Alpha");
	});
});
