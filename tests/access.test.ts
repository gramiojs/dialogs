import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { AccessDeniedHandler, DialogUpdateCtx } from "../src/types.ts";
import { Back, SwitchTo } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

/** Only the harness's default user (id 1) is allowed in. */
function guardedDialog(onAccessDenied?: AccessDeniedHandler) {
	return new Dialog({
		id: "g",
		access: (ctx) => ctx.from?.id === 1,
		onAccessDenied,
		windows: [
			new Window({
				state: "main",
				text: "main",
				keyboard: Column([SwitchTo("Go", "second", { id: "go" })]),
			}),
			new Window({
				state: "second",
				text: "second",
				keyboard: Column([Back("Back", { id: "bk" })]),
			}),
		],
	});
}

/** A callback ctx packed for the current top intent but from a different user. */
async function strangerClick(
	h: ReturnType<typeof createHarness>,
	widget: string,
): Promise<boolean> {
	const ctx = h.makeCtx("callback_query", await h.cb(widget));
	(ctx as unknown as { from: unknown }).from = { id: 999, firstName: "M" };
	return (await h.managerFor(ctx))._handleCallback();
}

describe("dialog access validator", () => {
	it("lets the authorized user interact", async () => {
		const h = createHarness([guardedDialog()]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("g");
		await h.click("go");
		expect(h.last().text).toBe("second");
	});

	it("rejects an unauthorized callback with a silent answer and no state change", async () => {
		const h = createHarness([guardedDialog()]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("g");

		const handled = await strangerClick(h, "go");
		expect(handled).toBe(true); // consumed, not passed through
		// default denial is silent (no hard-coded "Access denied" text)
		expect(h.answers.at(-1)).toBeUndefined();
		expect(h.last().text).toBe("main"); // never switched
	});

	it("routes denial to onAccessDenied when provided", async () => {
		const h = createHarness([
			guardedDialog((ctx) =>
				(ctx as unknown as { answer: (t: string) => unknown }).answer("nope"),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("g");

		await strangerClick(h, "go");
		expect(h.answers).toContain("nope");
		expect(h.answers).not.toContain("Access denied");
	});

	it("silently ignores an unauthorized message (falls through)", async () => {
		let seen = "";
		const dialog = new Dialog({
			id: "g",
			access: (ctx) => ctx.from?.id === 1,
			windows: [
				new Window({
					state: "main",
					text: "main",
					onMessage: (ctx) => {
						seen = ctx.text ?? "";
					},
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("g");

		const ctx = h.makeCtx("message", undefined, "hello") as DialogUpdateCtx;
		(ctx as unknown as { from: unknown }).from = { id: 999, firstName: "M" };
		const handled = await (await h.managerFor(ctx))._handleMessage();

		expect(handled).toBe(false); // not consumed
		expect(seen).toBe(""); // onMessage never ran
	});
});
