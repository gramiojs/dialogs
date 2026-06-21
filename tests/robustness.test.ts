import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { createDialogs } from "../src/plugin.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const simple = () =>
	new Dialog({
		id: "d",
		windows: [new Window({ state: "m", text: "hi" })],
	});

describe("engine robustness / contracts", () => {
	it("done() on an empty stack is a no-op (handles double-close)", async () => {
		const h = createHarness([simple()]);
		await h.reset();
		const m = await h.managerFor(h.makeCtx("callback_query"));
		await expect(m.done()).resolves.toBeUndefined();
		expect(h.log.length).toBe(0);
	});

	it("background() throws clearly when the stack was never rendered", async () => {
		const { background } = createDialogs([simple()]);
		const fakeBot = { api: {} } as never;
		await expect(background(fakeBot, "grd:never")).rejects.toThrow(
			/no rendered message/i,
		);
	});

	it("update() merges into dialogData and re-renders", async () => {
		const dialog = new Dialog({
			id: "u",
			windows: [
				new Window({
					state: "m",
					text: (d) => `n=${(d.dialogData as { n?: number }).n ?? 0}`,
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		const m = await h.managerFor(h.makeCtx("callback_query"));
		await m.start("u");
		expect(h.last().text).toBe("n=0");
		await m.update({ n: 42 });
		expect(h.last().text).toBe("n=42");
	});

	it("throws when a button's callback_data exceeds 64 bytes", async () => {
		const longId = "x".repeat(90); // packed payload will exceed the 64-byte cap
		const dialog = new Dialog({
			id: "w",
			windows: [
				new Window({
					state: "m",
					text: "hi",
					keyboard: Column([Button("tap", { id: longId })]),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		// fail-fast at build instead of letting Telegram reject the whole send
		await expect(
			(await h.managerFor(h.makeCtx("message"))).start("w"),
		).rejects.toThrow(/callback_data for widget .* is \d+ bytes/);
	});
});
