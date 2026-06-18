import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { DataDict, RenderContext } from "../src/types.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import {
	Countdown,
	LiveProgress,
	Spinner,
	typing,
} from "../src/widgets/live.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const rc = (data: DataDict): RenderContext => ({
	data,
	manager: undefined as never,
});

describe("Countdown", () => {
	it("formats remaining time and shows doneText when elapsed", async () => {
		expect(
			await Countdown({ until: 100_000, now: () => 40_000 }).renderText(rc({})),
		).toBe("⏳ 1:00");
		expect(
			await Countdown({ until: 3_661_000, now: () => 0 }).renderText(rc({})),
		).toBe("⏳ 1:01:01");
		expect(
			await Countdown({
				until: 100_000,
				now: () => 100_000,
				doneText: "done",
			}).renderText(rc({})),
		).toBe("done");
	});
});

describe("LiveProgress", () => {
	it("renders a bar with a percentage", async () => {
		expect(
			await LiveProgress({ value: (d) => d.p as number, width: 10 }).renderText(
				rc({ p: 50 }),
			),
		).toBe("█████░░░░░ 50%");
	});
});

describe("typing", () => {
	it("calls sendChatAction with the given action", async () => {
		let action = "";
		const ctx = {
			bot: {
				api: {
					sendChatAction: (p: { action: string }) => {
						action = p.action;
						return true;
					},
				},
			},
			chatId: 1,
		};
		await typing(ctx);
		expect(action).toBe("typing");
		await typing(ctx, "upload_photo");
		expect(action).toBe("upload_photo");
	});
});

describe("Spinner", () => {
	it("advances a frame on each render", async () => {
		const dialog = new Dialog({
			id: "sp",
			windows: [
				new Window({
					state: "m",
					text: Spinner({ id: "spin", label: "loading" }),
					keyboard: Column([Button("r", { id: "r" })]),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("sp");
		expect(h.last().text).toBe("⠋ loading");

		await h.click("r"); // re-render → next frame
		expect(h.last().text).toBe("⠙ loading");
	});
});
