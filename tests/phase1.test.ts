import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { RenderContext } from "../src/types.ts";
import { Button, Url, WebApp } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { TextInput } from "../src/widgets/input.ts";
import {
	Checkbox,
	Counter,
	Multiselect,
	Radio,
} from "../src/widgets/stateful.ts";
import { Case, Const, List, Multi } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const rc = (data: Record<string, unknown>): RenderContext => ({
	data,
	manager: undefined as never,
});

describe("text widgets (Multi/Case/List)", () => {
	it("Multi concatenates with a separator", async () => {
		expect(
			await Multi([Const("a"), Const("b")], { sep: " · " }).renderText(rc({})),
		).toBe("a · b");
	});

	it("Case picks a branch by data value, falling back to default", async () => {
		const t = Case("status", { ok: Const("✅"), default: Const("…") });
		expect(await t.renderText(rc({ status: "ok" }))).toBe("✅");
		expect(await t.renderText(rc({ status: "weird" }))).toBe("…");
	});

	it("List renders one line per item", async () => {
		const t = List<{ n: number }>({
			items: (d) => d.xs as { n: number }[],
			item: (x) => `#${x.n}`,
		});
		expect(await t.renderText(rc({ xs: [{ n: 1 }, { n: 2 }] }))).toBe("#1\n#2");
	});
});

describe("link buttons (Url/WebApp)", () => {
	it("Url renders a url button and never handles callbacks", async () => {
		const w = Url({ text: Const("g"), url: "https://x" });
		expect((await w.renderKeyboard(rc({})))[0]?.[0]).toEqual({
			text: "g",
			url: "https://x",
		});
		expect(await w.processCallback("g", undefined, undefined as never)).toBe(
			false,
		);
	});

	it("WebApp renders a web_app button", async () => {
		const rows = await WebApp({
			text: Const("app"),
			url: "https://x",
		}).renderKeyboard(rc({}));
		expect(rows[0]?.[0]?.webApp).toBe("https://x");
	});

	it("Button carries icon_custom_emoji_id + style onto the raw button", async () => {
		const b = Button({
			text: Const("x"),
			id: "b",
			icon: "555",
			style: "primary",
		});
		const raw = (await b.renderKeyboard(rc({})))[0]?.[0];
		expect(raw?.iconEmojiId).toBe("555");
		expect(raw?.style).toBe("primary");
	});

	it("Button style accepts a function resolved from render data", async () => {
		const b = Button({
			text: Const("x"),
			id: "b",
			style: (rc) => (rc.data.ok ? "success" : "danger"),
		});
		const r1 = (await b.renderKeyboard(rc({ ok: true })))[0]?.[0];
		expect(r1?.style).toBe("success");
		const r2 = (await b.renderKeyboard(rc({ ok: false })))[0]?.[0];
		expect(r2?.style).toBe("danger");
	});

	it("Button style function can return undefined", async () => {
		const b = Button({
			text: Const("x"),
			id: "b",
			style: (_rc) => undefined,
		});
		const raw = (await b.renderKeyboard(rc({})))[0]?.[0];
		expect(raw?.style).toBeUndefined();
	});

	it("Url style accepts a function", async () => {
		const w = Url({
			text: Const("g"),
			url: "https://x",
			style: (rc) => ((rc.data as { n: number }).n > 0 ? "primary" : undefined),
		});
		const r1 = (await w.renderKeyboard(rc({ n: 1 })))[0]?.[0];
		expect(r1?.style).toBe("primary");
		const r2 = (await w.renderKeyboard(rc({ n: 0 })))[0]?.[0];
		expect(r2?.style).toBeUndefined();
	});
});

describe("managed widget accessors (manager.counter/checkbox/radio/multiselect)", () => {
	const dlg = new Dialog({
		id: "m",
		windows: [
			new Window({
				state: "main",
				text: Const("x"),
				keyboard: Column([
					Counter({ id: "c", default: 0 }),
					Checkbox({
						id: "chk",
						checkedText: Const("on"),
						uncheckedText: Const("off"),
					}),
					Radio<{ id: string }>({
						id: "rd",
						items: () => [{ id: "a" }, { id: "b" }],
						itemId: (x) => x.id,
						checkedText: Const("*"),
						uncheckedText: Const("o"),
					}),
					Multiselect<{ id: string }>({
						id: "ms",
						items: () => [{ id: "a" }, { id: "b" }],
						itemId: (x) => x.id,
						checkedText: Const("x"),
						uncheckedText: Const("o"),
					}),
				]),
			}),
		],
	});

	it("reads and writes widget state programmatically", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.managerFor(h.makeCtx("message"));
		await m.start("m");

		m.counter("c").set(5);
		expect(m.counter("c").get()).toBe(5);

		m.checkbox("chk").toggle();
		expect(m.checkbox("chk").checked()).toBe(true);

		m.radio("rd").set("b");
		expect(m.radio("rd").selected()).toBe("b");

		m.multiselect("ms").toggle("a");
		m.multiselect("ms").toggle("b");
		expect(m.multiselect("ms").selected()).toEqual(["a", "b"]);
		expect(m.multiselect("ms").isSelected("a")).toBe(true);
		m.multiselect("ms").toggle("a");
		expect(m.multiselect("ms").selected()).toEqual(["b"]);
	});
});

describe("TextInput (typed input with validation)", () => {
	const captured: { ok?: number; err?: boolean } = {};
	const dlg = new Dialog({
		id: "i",
		windows: [
			new Window({
				state: "main",
				text: Const("age?"),
				input: TextInput<number>({
					id: "age",
					parse: (t) => {
						const n = Number(t);
						if (!Number.isFinite(n)) throw new Error("nan");
						return n;
					},
					onSuccess: (_c, v) => {
						captured.ok = v;
					},
					onError: () => {
						captured.err = true;
					},
				}),
			}),
		],
	});

	it("parses + stores valid input, reports parse errors", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("i", "main");

		expect(await h.sendText("42")).toBe(true);
		expect(captured.ok).toBe(42);
		expect((await h.load()).intents.at(-1)?.widgetData.age).toBe(42);

		await h.sendText("abc");
		expect(captured.err).toBe(true);
	});
});
