import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { Confirm, Rating, Slider } from "../src/widgets/forms.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

describe("Rating", () => {
	it("sets, fills, and clears stars", async () => {
		const changes: number[] = [];
		const dialog = new Dialog({
			id: "r",
			windows: [
				new Window({
					state: "m",
					text: "rate",
					keyboard: Rating({
						id: "rate",
						onChanged: (_c, v) => changes.push(v),
					}),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("r");
		expect(h.flatTexts()).toEqual(["☆", "☆", "☆", "☆", "☆"]);

		await h.click("rate", "3");
		expect(h.flatTexts()).toEqual(["⭐", "⭐", "⭐", "☆", "☆"]);
		expect(changes).toEqual([3]);

		await h.click("rate", "3"); // tap current value → clear
		expect(h.flatTexts()).toEqual(["☆", "☆", "☆", "☆", "☆"]);
		expect(changes).toEqual([3, 0]);
	});
});

describe("Slider", () => {
	it("steps within bounds and fires onChanged only on change", async () => {
		const changes: number[] = [];
		const dialog = new Dialog({
			id: "s",
			windows: [
				new Window({
					state: "m",
					text: "vol",
					keyboard: Slider({
						id: "vol",
						min: 0,
						max: 10,
						default: 1,
						width: 5,
						onChanged: (_c, v) => changes.push(v),
					}),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("s");

		expect(h.flatTexts()[0]).toBe("‹");
		expect(h.flatTexts()[2]).toBe("›");
		expect(h.flatTexts()[1]).toContain("1");

		await h.click("vol", "-"); // 1 → 0
		expect(h.flatTexts()[1]).toContain("0");
		await h.click("vol", "-"); // already at min → no-op (no onChanged)
		await h.click("vol", "+"); // 0 → 1
		expect(changes).toEqual([0, 1]);
	});
});

describe("Confirm", () => {
	it("fires onConfirm / onCancel", async () => {
		let result = "";
		const dialog = new Dialog({
			id: "c",
			windows: [
				new Window({
					state: "m",
					text: "sure?",
					keyboard: Confirm({
						id: "cf",
						onConfirm: () => {
							result = "yes";
						},
						onCancel: () => {
							result = "no";
						},
					}),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("c");
		expect(h.flatTexts()).toEqual(["✅ Yes", "❌ No"]);

		await h.click("cf", "y");
		expect(result).toBe("yes");
		await h.click("cf", "n");
		expect(result).toBe("no");
	});
});
