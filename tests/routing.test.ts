import { afterEach, describe, expect, it } from "bun:test";
import { Button, Column, Counter, Dialog, Window } from "../src/index.ts";
import { __resetCallbackWarnings } from "../src/manager.ts";
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

describe("oversized callback_data warning", () => {
	afterEach(() => {
		__resetCallbackWarnings();
	});

	it("warns exactly once per widget across repeated renders", async () => {
		__resetCallbackWarnings();
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

		const warnings: string[] = [];
		const original = console.warn;
		console.warn = (msg?: unknown) => warnings.push(String(msg));
		try {
			const h = createHarness([dlg]);
			await h.reset();
			const m = await h.start("warn"); // render #1
			await m.show(); // render #2
			await m.show(); // render #3
		} finally {
			console.warn = original;
		}

		const hits = warnings.filter(
			(w) => w.includes("callback_data") && w.includes("> 64"),
		);
		expect(hits.length).toBe(1); // deduped to one despite three renders
	});
});
