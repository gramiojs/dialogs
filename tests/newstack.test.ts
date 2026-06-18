import { describe, expect, it } from "bun:test";
import { DIALOG_CB } from "../src/callback.ts";
import { Dialog } from "../src/dialog.ts";
import { StartMode } from "../src/types.ts";
import { Button, Start, SwitchTo } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const main = new Dialog({
	id: "main",
	windows: [
		new Window({
			state: "menu",
			text: Const("menu"),
			keyboard: Column([
				SwitchTo({ text: Const("about"), state: "about", id: "to_about" }),
				Start({
					text: Const("open"),
					dialogId: "child",
					id: "open",
					startMode: StartMode.NewStack,
				}),
			]),
		}),
		new Window({ state: "about", text: Const("about-win") }),
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
					text: Const("fin"),
					id: "fin",
					onClick: (c) => c.dialog.done(),
				}),
			]),
		}),
	],
});

describe("StartMode.NewStack (parallel independent stacks)", () => {
	it("opens a second stack and routes callbacks to the owning one", async () => {
		const h = createHarness([main, child]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("main");

		const mainIntent =
			(await h.repo.loadStore(h.key)).stacks[0]?.intents.at(-1)?.intentId ?? "";

		// open child in a NEW stack
		await (
			await h.managerFor(
				h.makeCtx(
					"callback_query",
					DIALOG_CB.pack({ i: mainIntent, w: "open" }),
				),
			)
		)._handleCallback();
		let store = await h.repo.loadStore(h.key);
		expect(store.stacks.length).toBe(2);
		expect(
			store.stacks.find((s) => s.id === store.currentId)?.intents.at(-1)
				?.groupId,
		).toBe("child");

		// a callback for the MAIN dialog (the other, parallel stack) routes back to it
		await (
			await h.managerFor(
				h.makeCtx(
					"callback_query",
					DIALOG_CB.pack({ i: mainIntent, w: "to_about" }),
				),
			)
		)._handleCallback();
		store = await h.repo.loadStore(h.key);
		const current = store.stacks.find((s) => s.id === store.currentId);
		expect(current?.intents.at(-1)?.groupId).toBe("main");
		expect(current?.intents.at(-1)?.stateKey).toBe("about");

		// closing the child collapses its (now empty) stack
		const childIntent =
			store.stacks
				.find((s) => s.intents.at(-1)?.groupId === "child")
				?.intents.at(-1)?.intentId ?? "";
		await (
			await h.managerFor(
				h.makeCtx(
					"callback_query",
					DIALOG_CB.pack({ i: childIntent, w: "fin" }),
				),
			)
		)._handleCallback();
		expect((await h.repo.loadStore(h.key)).stacks.length).toBe(1);
	});
});
