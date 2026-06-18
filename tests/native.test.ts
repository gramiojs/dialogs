import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { Keyboard } from "../src/types.ts";
import { Column } from "../src/widgets/group.ts";
import {
	ContactRequest,
	LocationButton,
	Poll,
	Reactions,
	RequestChat,
	RequestUser,
	getReactions,
} from "../src/widgets/native.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const single = (keyboard: Keyboard, id = "d", reply = false) =>
	new Dialog({
		id,
		windows: [new Window({ state: "m", text: "x", keyboard, reply })],
	});

describe("Poll", () => {
	it("sends a poll via the Bot API on tap", async () => {
		const h = createHarness([
			single(
				Poll({
					id: "poll",
					text: "Vote",
					question: "Fav?",
					options: ["A", "B"],
				}),
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual(["Vote"]);

		await h.click("poll");
		const poll = h.log.find((l) => l.kind === "poll");
		expect(poll?.text).toBe("Fav?");
		expect(poll?.pollOptions).toEqual(["A", "B"]);
	});
});

describe("Reactions", () => {
	it("single-selects an emoji", async () => {
		const h = createHarness([
			single(Reactions({ id: "rx", items: ["👍", "❤️", "🔥"] })),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual(["👍", "❤️", "🔥"]);

		await h.click("rx", "0");
		expect(h.flatTexts()).toEqual(["[👍]", "❤️", "🔥"]);
		await h.click("rx", "2"); // single → replaces
		expect(h.flatTexts()).toEqual(["👍", "❤️", "[🔥]"]);

		const m = await h.managerFor(h.makeCtx("callback_query"));
		expect(getReactions(m, "rx")).toEqual(["🔥"]);
	});

	it("multi-selects when multi:true", async () => {
		const h = createHarness([
			single(Reactions({ id: "rx", items: ["👍", "❤️"], multi: true }), "d2"),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d2");
		await h.click("rx", "0");
		await h.click("rx", "1");
		expect(h.flatTexts()).toEqual(["[👍]", "[❤️]"]);
	});
});

describe("reply-keyboard request buttons", () => {
	it("renders user/chat/contact/location request buttons in a reply window", async () => {
		const h = createHarness([
			single(
				Column([
					RequestUser({ text: "Pick user" }),
					RequestChat({ text: "Pick chat" }),
					ContactRequest({ text: "Share contact" }),
					LocationButton({ text: "Share location" }),
				]),
				"d",
				true, // reply keyboard
			),
		]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");
		expect(h.flatTexts()).toEqual([
			"Pick user",
			"Pick chat",
			"Share contact",
			"Share location",
		]);
	});
});
