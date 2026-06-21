import { describe, expect, it } from "bun:test";
import { Button, Column, Counter, Dialog, Window } from "../src/index.ts";
import { createHarness } from "./helpers.ts";

describe("callback routing contract", () => {
	it("ignores a tap on an unknown widget id (silent no-op, no throw)", async () => {
		const dlg = new Dialog({
			id: "r",
			windows: [
				new Window({
					state: "m",
					text: "x",
					keyboard: Counter({ id: "c", default: 3, min: 0, max: 9 }),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("r");
		const wd = () => h.load().then((s) => s.intents.at(-1)?.widgetData ?? {});
		const before = (await wd()).c;

		await expect(h.click("nope", "x")).resolves.toBeUndefined(); // no throw
		expect((await wd()).c).toBe(before); // state unchanged
	});
});

describe("oversized callback_data (D2-5)", () => {
	it("throws a clear error naming the widget instead of letting the send reject", async () => {
		const longId = "z".repeat(90); // packed payload exceeds the 64-byte cap
		const dlg = new Dialog({
			id: "warn",
			windows: [
				new Window({
					state: "m",
					text: "hi",
					keyboard: Column([Button("tap", { id: longId })]),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();

		// fail-fast at keyboard build, with the offending widget id in the message
		await expect(h.start("warn")).rejects.toThrow(
			new RegExp(`callback_data for widget "${longId}" is \\d+ bytes`),
		);
	});
});
