import { describe, expect, it } from "bun:test";
import { DIALOG_CB } from "../src/callback.ts";
import { Dialog } from "../src/dialog.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

// Regression: silentAnswer() used to detach `answer` from its ctx
// (`const a = ctx.answer; a()`). gramio's `answer` is a prototype alias that
// reaches `this.bot.api.answerCallbackQuery`, so a detached call throws
// SYNCHRONOUSLY (this === undefined) — and `.catch()` only catches rejections,
// so the throw escaped into the bot's onError. We now call it bound, inside
// try/catch.
const dlg = new Dialog({
	id: "ans",
	windows: [
		new Window({
			state: "a",
			text: Const("a"),
			keyboard: Column([Button("x", { id: "x", onClick: (c) => c.answer() })]),
		}),
	],
});

/** Install a `this`-dependent `answer` (like gramio's prototype alias). */
function installPrototypeAnswer(
	ctx: { chatId?: number },
	counter: { n: number },
): void {
	(ctx as { answer: () => Promise<boolean> }).answer = function (this: {
		chatId?: number;
	}) {
		// Detached → `this` is undefined → reading `this.chatId` throws synchronously,
		// exactly as gramio's alias throws on `this.bot.api…`.
		void this.chatId;
		counter.n++;
		return Promise.resolve(true);
	};
}

describe("callback answer binding", () => {
	it("stale tap closes the spinner bound, without a synchronous throw escaping", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("ans", "a");

		// Craft a STALE callback (intent id that no live stack owns).
		const stale = DIALOG_CB.pack({ i: "ghost-intent", w: "x" });
		const ctx = h.makeCtx("callback_query", stale);
		const calls = { n: 0 };
		installPrototypeAnswer(ctx as unknown as { chatId?: number }, calls);

		const m = await h.managerFor(ctx);
		// On the old detached code this rejects with a TypeError; now it resolves.
		expect(await m._handleCallback()).toBe(true);
		expect(calls.n).toBe(1); // answer ran once, with `this` intact
	});

	it("handled tap also closes the spinner bound", async () => {
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("ans", "a");

		const data = await h.cb("x");
		const ctx = h.makeCtx("callback_query", data);
		const calls = { n: 0 };
		installPrototypeAnswer(ctx as unknown as { chatId?: number }, calls);

		const m = await h.managerFor(ctx);
		expect(await m._handleCallback()).toBe(true);
		// onClick's c.answer() + the engine's trailing silentAnswer both bound → no throw.
		expect(calls.n).toBeGreaterThanOrEqual(1);
	});
});
