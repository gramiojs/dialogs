import { beforeEach, describe, expect, it } from "bun:test";
import { inMemoryStorage } from "@gramio/storage";
import { bold, format } from "gramio";
import type { DialogStack } from "../src/context.ts";
import { Dialog } from "../src/dialog.ts";
import { createDialogs } from "../src/plugin.ts";
import { ShowMode } from "../src/types.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { StaticMedia } from "../src/widgets/media.ts";
import { Const, Format } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const mediaDlg = new Dialog({
	id: "m",
	windows: [
		new Window({ state: "a", text: Const("text-a") }),
		new Window({ state: "b", text: Const("text-b") }),
		new Window({
			state: "photo",
			text: Const("caption"),
			media: StaticMedia("http://x/p.jpg", "photo"),
		}),
		new Window({
			state: "fmt",
			text: Format(() => format`${bold("B")} текст`),
		}),
		new Window({
			state: "reply",
			reply: true,
			text: Const("reply menu"),
			keyboard: Column([
				Button({
					text: Const("Нажми"),
					id: "go",
					onClick: (c) => {
						c.dialog.data.tapped = true;
						return c.answer();
					},
				}),
			]),
		}),
	],
});

describe("media transitions", () => {
	let h: ReturnType<typeof createHarness>;
	beforeEach(async () => {
		h = createHarness([mediaDlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("m", "a");
	});

	it("text → media deletes the old message and sends a photo", async () => {
		const before = h.log.length;
		await (await h.managerFor(h.makeCtx("callback_query"))).switchTo("photo");
		const recent = h.log.slice(before);
		expect(recent.some((e) => e.kind === "delete")).toBe(true);
		const sent = recent.find((e) => e.kind === "media");
		expect(sent?.mediaType).toBe("photo");
		expect(sent?.text).toBe("caption");
		expect((await h.load()).hasMedia).toBe(true);
	});

	it("media → text deletes the photo and sends a message", async () => {
		await (await h.managerFor(h.makeCtx("callback_query"))).switchTo("photo");
		const before = h.log.length;
		await (await h.managerFor(h.makeCtx("callback_query"))).switchTo("b");
		const recent = h.log.slice(before);
		expect(recent.some((e) => e.kind === "delete")).toBe(true);
		expect(recent.some((e) => e.kind === "send")).toBe(true);
		expect((await h.load()).hasMedia).toBe(false);
	});
});

describe("formatting", () => {
	it("renders FormattableString to plain text (entities handled by gramio)", async () => {
		const h = createHarness([mediaDlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("m", "fmt");
		expect(h.last().text).toBe("B текст");
	});
});

describe("reply keyboard fallback", () => {
	let h: ReturnType<typeof createHarness>;
	beforeEach(async () => {
		h = createHarness([mediaDlg]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("m", "reply");
	});

	it("renders a reply keyboard whose label hides the callback", () => {
		const label = h.last().buttons[0]?.[0]?.text ?? "";
		expect(label.startsWith("Нажми")).toBe(true);
		expect(label.length).toBeGreaterThan("Нажми".length); // invisible suffix present
	});

	it("decodes a tapped reply button back into a callback", async () => {
		const label = h.last().buttons[0]?.[0]?.text ?? "";
		const handled = await h.sendText(label);
		expect(handled).toBe(true);
		expect((await h.load()).intents.at(-1)?.data.tapped).toBe(true);
	});

	it("treats a plain message as input, not a reply callback", async () => {
		// no onMessage on this window → not handled, falls through
		expect(await h.sendText("случайный текст")).toBe(false);
	});
});

describe("background updates", () => {
	it("edits a stored message from outside a handler", async () => {
		const storage = inMemoryStorage();
		const engine = createDialogs([mediaDlg], { storage });
		const stack: DialogStack = {
			id: "default",
			intents: [
				{
					intentId: "bg1",
					stackId: "default",
					groupId: "m",
					stateKey: "a",
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
		await storage.set("bgkey", stack);

		let edited: { message_id?: number; text?: unknown } | undefined;
		const api = {
			editMessageText: async (p: { message_id: number; text: unknown }) => {
				edited = p;
				return true;
			},
		};
		const bg = await engine.background({ api } as never, "bgkey");
		await bg.switchTo("b", ShowMode.Edit);
		expect(edited?.message_id).toBe(777);
		expect(edited?.text).toBe("text-b");
	});
});
