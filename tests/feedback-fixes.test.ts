import { describe, expect, it } from "bun:test";
import { inMemoryStorage } from "@gramio/storage";
import type { DialogStack } from "../src/context.ts";
import { Dialog } from "../src/dialog.ts";
import { createDialogs } from "../src/plugin.ts";
import { ShowMode } from "../src/types.ts";
import { Select } from "../src/widgets/stateful.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

/** Seed a single-intent stack with a rendered message, for background() tests. */
function seedStack(stateKey: string): DialogStack {
	return {
		id: "default",
		intents: [
			{
				intentId: "bg1",
				stackId: "default",
				groupId: "f",
				stateKey,
				startData: undefined,
				data: {},
				widgetData: {},
				history: [],
			},
		],
		lastMessageId: 777,
		lastChatId: 1,
		hasMedia: false,
	};
}

// ── #1: headless ctx synthesizes `from` ──────────────────────────────
describe("background headless ctx", () => {
	it("exposes from.id so interactive getters don't crash from background()", async () => {
		const dlg = new Dialog({
			id: "f",
			windows: [
				new Window({ state: "a", text: Const("a") }),
				new Window({
					state: "b",
					// a getter written for the interactive path
					getter: (ctx) => ({ uid: ctx.from?.id ?? "NONE" }),
					text: (d) => `uid:${d.uid}`,
				}),
			],
		});
		const storage = inMemoryStorage();
		const engine = createDialogs([dlg], { storage });
		await storage.set("bgkey", seedStack("a"));

		let edited: { text?: unknown } | undefined;
		const api = {
			editMessageText: async (p: { text: unknown }) => {
				edited = p;
				return true;
			},
		};
		const bg = await engine.background({ api } as never, "bgkey");
		await bg.switchTo("b", ShowMode.Edit);
		expect(edited?.text).toBe("uid:1"); // chatId 1 → from.id 1, not "NONE"
	});
});

// ── #2: setData (no render) ──────────────────────────────────────────
describe("setData", () => {
	const dlg = new Dialog({
		id: "d",
		windows: [new Window({ state: "a", text: Const("a") })],
	});

	it("merges dialog data and persists WITHOUT rendering", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.start("d", "a");
		const before = h.log.length;

		await m.setData({ k: 1 });

		expect(h.log.length).toBe(before); // no send/edit happened
		expect((await h.load()).intents.at(-1)?.data.k).toBe(1); // but persisted
	});
});

// ── #3: switchTo(state, { data }) ────────────────────────────────────
describe("switchTo with data", () => {
	const dlg = new Dialog({
		id: "nav",
		windows: [
			new Window({ state: "a", text: Const("a") }),
			new Window({
				state: "b",
				text: (d) => `hi ${(d.dialogData as { name?: string }).name ?? "?"}`,
			}),
		],
	});

	it("merges into dialogData before rendering the TARGET window", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.start("nav", "a");

		await m.switchTo("b", { data: { name: "Bob" } });

		expect(h.last().text).toBe("hi Bob");
		expect((await h.load()).intents.at(-1)?.data.name).toBe("Bob");
		expect((await h.load()).intents.at(-1)?.stateKey).toBe("b");
	});

	it("still accepts a bare ShowMode as the 2nd arg", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.start("nav", "a");
		await m.switchTo("b", ShowMode.Send);
		expect(h.last().kind).toBe("send");
	});
});

// ── #5: Select({ selected }) auto-✓ ──────────────────────────────────
describe("stateless Select selected", () => {
	function selectDlg(selected?: (d: Record<string, unknown>) => string) {
		return new Dialog({
			id: "sel",
			windows: [
				new Window({
					state: "s",
					getter: () => ({ items: ["a", "b", "c"], current: "b" }),
					keyboard: Select<string>({
						id: "pick",
						items: (d) => d.items as string[],
						itemId: (x) => x,
						text: (st) => String(st.item),
						selected,
						onClick: () => {},
					}),
				}),
			],
		});
	}

	it("appends ✓ to the item matching `selected`", async () => {
		const h = createHarness([selectDlg((d) => d.current as string)]);
		await h.reset();
		await h.start("sel", "s");
		expect(h.flatTexts()).toEqual(["a", "b ✓", "c"]);
	});

	it("adds no mark when `selected` is omitted", async () => {
		const h = createHarness([selectDlg()]);
		await h.reset();
		await h.start("sel", "s");
		expect(h.flatTexts()).toEqual(["a", "b", "c"]);
	});
});
