import { describe, expect, it } from "bun:test";
import { DIALOG_CB, makeCodec } from "../src/callback.ts";
import { Dialog } from "../src/dialog.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

/** Minimal one-window dialog with a single callback button. */
function dialogWith(onClick: () => unknown, access?: () => boolean): Dialog {
	return new Dialog({
		id: "d",
		access,
		windows: [
			new Window({
				state: "main",
				text: Const("hi"),
				keyboard: Column([Button({ text: Const("go"), id: "go", onClick })]),
			}),
		],
	});
}

describe("callback codec", () => {
	it("default codec round-trips and rejects foreign data", () => {
		const c = makeCodec();
		const packed = c.pack({ i: "a", w: "b", p: "7" });
		expect(c.filter(packed)).toBe(true);
		const u = c.safeUnpack(packed);
		expect(u.success).toBe(true);
		if (u.success) {
			expect(u.data.i).toBe("a");
			expect(u.data.w).toBe("b");
			expect(u.data.p).toBe("7");
		}
		expect(c.filter("totally-foreign")).toBe(false);
	});

	it("a renamed prefix is namespaced apart from the default 'grd' scheme", () => {
		const grd = makeCodec();
		const mine = makeCodec({ name: "myapp" });
		const packed = mine.pack({ i: "a", w: "b" });
		// a foreign-prefixed callback is not recognised by the default codec
		expect(grd.filter(packed)).toBe(false);
		expect(mine.filter(packed)).toBe(true);
	});

	it("supports a fully custom pack/unpack pair", () => {
		const codec = makeCodec({
			pack: (d) => `x|${d.i}|${d.w}|${d.p ?? ""}`,
			unpack: (raw) => {
				if (!raw.startsWith("x|")) return null;
				const [, i, w, p] = raw.split("|");
				return { i: i ?? "", w: w ?? "", p: p || undefined };
			},
		});
		const packed = codec.pack({ i: "1", w: "btn", p: "42" });
		expect(packed).toBe("x|1|btn|42");
		expect(codec.filter(packed)).toBe(true);
		expect(codec.filter("nope")).toBe(false);
		const u = codec.safeUnpack(packed);
		expect(u.success).toBe(true);
		if (u.success) expect(u.data).toEqual({ i: "1", w: "btn", p: "42" });
		expect(codec.safeUnpack("nope").success).toBe(false);
	});

	it("a custom codec is used for BOTH rendering and routing", async () => {
		let clicked = false;
		const codec = makeCodec({
			pack: (d) => `x|${d.i}|${d.w}|${d.p ?? ""}`,
			unpack: (raw) => {
				if (!raw.startsWith("x|")) return null;
				const [, i, w, p] = raw.split("|");
				return { i: i ?? "", w: w ?? "", p: p || undefined };
			},
		});
		const h = createHarness(
			[
				dialogWith(() => {
					clicked = true;
				}),
			],
			"grd:1",
			{ codec },
		);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		// the rendered button's callback_data was packed by the custom codec
		const data = h.last().buttons[0]?.[0]?.data ?? "";
		expect(data.startsWith("x|")).toBe(true);

		// and routing it back through the engine fires the onClick
		await (
			await h.managerFor(h.makeCtx("callback_query", data))
		)._handleCallback();
		expect(clicked).toBe(true);
	});
});

describe("configurable events", () => {
	it("invokes events.onStale for a stale button (no hard-coded text)", async () => {
		let hit = false;
		const h = createHarness([dialogWith(() => undefined)], "grd:1", {
			events: {
				onStale: (ctx) => {
					hit = true;
					return (ctx as unknown as { answer: (t: string) => unknown }).answer(
						"expired",
					);
				},
			},
		});
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		await (
			await h.managerFor(
				h.makeCtx("callback_query", DIALOG_CB.pack({ i: "dead", w: "go" })),
			)
		)._handleCallback();

		expect(hit).toBe(true);
		expect(h.answers.at(-1)).toBe("expired");
	});

	it("falls back to events.onAccessDenied when the dialog has none", async () => {
		let denied = false;
		const h = createHarness(
			[
				dialogWith(
					() => undefined,
					() => false,
				),
			],
			"grd:1",
			{
				events: {
					onAccessDenied: () => {
						denied = true;
					},
				},
			},
		);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		await h.click("go");
		expect(denied).toBe(true);
	});
});
