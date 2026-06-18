import { beforeEach, describe, expect, it } from "bun:test";
import { DIALOG_CB } from "../src/callback.ts";
import { Dialog } from "../src/dialog.ts";
import { StartMode } from "../src/types.ts";
import { Back, Button, Start, SwitchTo } from "../src/widgets/button.ts";
import { Column, Group } from "../src/widgets/group.ts";
import { Const, Format } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const main = new Dialog({
	id: "main",
	windows: [
		new Window({
			state: "menu",
			text: Format("Привет, {name}!"),
			getter: (c) => ({ name: c.from?.firstName ?? "w" }),
			keyboard: Group(
				[
					SwitchTo({ text: Const("О"), state: "about", id: "to_about" }),
					Button({
						text: Const("k"),
						id: "ping",
						onClick: (c) => c.answer("pong"),
					}),
					Start({ text: Const("child"), dialogId: "child", id: "to_child" }),
				],
				{ width: 1 },
			),
		}),
		new Window({
			state: "about",
			text: Const("about"),
			keyboard: Column([Back({ text: Const("b"), id: "back" })]),
		}),
	],
});

const child = new Dialog({
	id: "child",
	windows: [
		new Window({
			state: "main",
			text: Const("child"),
			keyboard: Column([
				Button({
					text: Const("done"),
					id: "fin",
					onClick: (c) => c.dialog.done(42),
				}),
			]),
		}),
	],
});

describe("core navigation", () => {
	let h: ReturnType<typeof createHarness>;
	beforeEach(async () => {
		h = createHarness([main, child]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("main");
	});

	it("start sends a message with getter-interpolated text", () => {
		expect(h.last().kind).toBe("send");
		expect(h.last().text).toBe("Привет, Тест!");
	});

	it("switchTo edits in place", async () => {
		await h.click("to_about");
		expect(h.last().kind).toBe("edit");
		expect(h.last().text).toBe("about");
	});

	it("Back returns to the previous window", async () => {
		await h.click("to_about");
		await h.click("back");
		expect(h.last().text).toBe("Привет, Тест!");
	});

	it("answers stale buttons silently (no hard-coded text) and ignores them", async () => {
		const before = h.log.length;
		const m = await h.managerFor(
			h.makeCtx("callback_query", DIALOG_CB.pack({ i: "dead", w: "to_about" })),
		);
		await m._handleCallback();
		expect(h.log.length).toBe(before);
		// default behaviour is a silent answer — no "This button is outdated" text
		expect(h.answers.at(-1)).toBeUndefined();
	});

	it("lets foreign callbacks fall through", async () => {
		const m = await h.managerFor(h.makeCtx("callback_query", "other"));
		expect(await m._handleCallback()).toBe(false);
	});

	it("pushes and pops the dialog stack (start/done)", async () => {
		await h.click("to_child");
		expect((await h.load()).intents.length).toBe(2);
		expect(h.last().text).toBe("child");
		await h.click("fin");
		expect((await h.load()).intents.length).toBe(1);
	});

	it("StartMode.ResetStack clears the stack before pushing", async () => {
		await h.click("to_child"); // stack: [main, child]
		expect((await h.load()).intents.length).toBe(2);
		const m = await h.managerFor(h.makeCtx("message"));
		await m.start("main", undefined, { startMode: StartMode.ResetStack });
		const stack = await h.load();
		expect(stack.intents.length).toBe(1);
		expect(stack.intents[0]?.groupId).toBe("main");
	});

	it("swallows 'message is not modified' instead of sending a new message", async () => {
		const sendsBefore = h.log.filter((e) => e.kind === "send").length;
		const ctx = h.makeCtx("callback_query", await h.cb("ping"));
		(
			ctx as unknown as {
				bot: { api: { editMessageText: () => Promise<never> } };
			}
		).bot.api.editMessageText = async () => {
			throw { message: "Bad Request: message is not modified" };
		};
		await (await h.managerFor(ctx))._handleCallback();
		expect(h.log.filter((e) => e.kind === "send").length).toBe(sendsBefore);
	});
});
