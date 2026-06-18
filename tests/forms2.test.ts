import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { DataDict, RenderContext } from "../src/types.ts";
import {
	PinPad,
	Stepper,
	TagInput,
	addTag,
	getTags,
} from "../src/widgets/forms.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const rc = (data: DataDict): RenderContext => ({
	data,
	manager: undefined as never,
});

describe("Stepper", () => {
	it("renders progress glyphs and labels", async () => {
		expect(await Stepper({ steps: 4, current: 1 }).renderText(rc({}))).toBe(
			"●─◉─○─○",
		);
		expect(
			await Stepper({ steps: ["a", "b"], current: 0 }).renderText(rc({})),
		).toBe("◉ a─○ b");
		expect(
			await Stepper({ steps: 3, current: (d) => d.n as number }).renderText(
				rc({ n: 2 }),
			),
		).toBe("●─●─◉");
	});
});

describe("PinPad", () => {
	it("builds a code and fires onComplete at length", async () => {
		let done = "";
		const dialog = new Dialog({
			id: "p",
			windows: [
				new Window({
					state: "m",
					text: "pin",
					keyboard: PinPad({
						id: "pin",
						length: 4,
						onComplete: (_c, code) => {
							done = code;
						},
					}),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("p");
		expect(h.flatTexts()[0]).toBe("· · · ·"); // empty masked display

		await h.click("pin", "1");
		expect(h.flatTexts()[0]).toBe("• · · ·");
		await h.click("pin", "2");
		await h.click("pin", "B"); // backspace
		expect(h.flatTexts()[0]).toBe("• · · ·");
		await h.click("pin", "2");
		await h.click("pin", "3");
		await h.click("pin", "4");
		expect(done).toBe("1234");
	});
});

describe("TagInput", () => {
	it("removes a chip by index", async () => {
		const dialog = new Dialog({
			id: "t",
			windows: [
				new Window({
					state: "m",
					text: "tags",
					keyboard: TagInput({ id: "tags", default: ["a", "b", "c"] }),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("t");
		expect(h.flatTexts()).toEqual(["❌ a", "❌ b", "❌ c"]);

		await h.click("tags", "1"); // remove "b"
		expect(h.flatTexts()).toEqual(["❌ a", "❌ c"]);
	});

	it("addTag/getTags append and dedupe", async () => {
		const dialog = new Dialog({
			id: "t2",
			windows: [
				new Window({
					state: "m",
					text: "tags",
					keyboard: TagInput({ id: "tags" }),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("t2");

		const m = await h.managerFor(h.makeCtx("message"));
		addTag(m, "tags", "x");
		addTag(m, "tags", "x"); // dupe ignored
		addTag(m, "tags", "y");
		expect(getTags(m, "tags")).toEqual(["x", "y"]);
	});
});
