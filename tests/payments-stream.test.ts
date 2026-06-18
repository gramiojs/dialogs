import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import { StarsButton } from "../src/widgets/payments.ts";
import { stream } from "../src/widgets/stream.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

describe("StarsButton", () => {
	it("sends an XTR invoice on tap", async () => {
		const dialog = new Dialog({
			id: "s",
			windows: [
				new Window({
					state: "m",
					text: "shop",
					keyboard: StarsButton({
						id: "buy",
						text: "Buy Pro ⭐250",
						title: "Pro",
						description: "Pro plan",
						stars: 250,
					}),
				}),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("s");
		expect(h.flatTexts()).toEqual(["Buy Pro ⭐250"]);

		await h.click("buy");
		const invoice = h.log.find((l) => l.kind === "invoice");
		expect(invoice?.text).toBe("Pro");
		expect(invoice?.amount).toBe(250);
	});
});

describe("stream", () => {
	async function* tokens(): AsyncGenerator<string> {
		yield "Hel";
		yield "lo";
		yield "!";
	}

	it("drafts incrementally and finalizes with a real message", async () => {
		const drafts: string[] = [];
		let final = "";
		const ctx = {
			bot: {
				api: {
					sendMessageDraft: (p: { text?: string }) => {
						drafts.push(p.text ?? "");
						return true;
					},
					sendMessage: (p: { text: string }) => {
						final = p.text;
						return { message_id: 1 };
					},
				},
			},
			chatId: 1,
		};
		const result = await stream(ctx, tokens(), { throttleMs: 0 });
		expect(result).toBe("Hello!");
		expect(final).toBe("Hello!");
		expect(drafts[0]).toBe(""); // "Thinking…" placeholder
		expect(drafts).toContain("Hello!");
	});

	it("swallows draft errors but still sends the final message", async () => {
		let final = "";
		const ctx = {
			bot: {
				api: {
					sendMessageDraft: () => {
						throw new Error("draft not allowed (group chat)");
					},
					sendMessage: (p: { text: string }) => {
						final = p.text;
						return { message_id: 1 };
					},
				},
			},
			chatId: 1,
		};
		const result = await stream(ctx, tokens(), { throttleMs: 0 });
		expect(result).toBe("Hello!");
		expect(final).toBe("Hello!");
	});
});
