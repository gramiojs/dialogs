import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { RenderContext } from "../src/types.ts";
import { T } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

function greetDialog(text: ReturnType<typeof T>) {
	return new Dialog({
		id: "i",
		windows: [
			new Window({ state: "m", getter: () => ({ name: "Lina" }), text }),
		],
	});
}

describe("i18n `T` widget", () => {
	it("resolves keys through the configured translator", async () => {
		const dialog = greetDialog(
			T<{ name: string }>("hi", (d) => ({ name: d.name })),
		);
		const h = createHarness([dialog], "grd:1", {
			i18n: () => (key, params) => `[${key}|${params?.name}]`,
		});
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("i");
		expect(h.last().text).toBe("[hi|Lina]");
	});

	it("echoes the key when no translator is configured", async () => {
		const h = createHarness([greetDialog(T("plain"))]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("i");
		expect(h.last().text).toBe("plain");
	});

	it("degrades gracefully when the resolver throws", async () => {
		const h = createHarness([greetDialog(T("plain"))], "grd:1", {
			i18n: () => {
				throw new Error("boom (e.g. ctx.from is undefined)");
			},
		});
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("i");
		expect(h.last().text).toBe("plain"); // fell back to echo, no crash
	});

	it("falls back to a `ctx.t` on the update", async () => {
		const h = createHarness([greetDialog(T("plain"))]);
		const ctx = h.makeCtx("message");
		(ctx as unknown as { t: unknown }).t = (k: string) => `t:${k}`;
		const m = await h.managerFor(ctx);
		expect(String(m.t("x"))).toBe("t:x");
	});

	it("passes key + params straight to manager.t", async () => {
		const calls: [string, unknown][] = [];
		const widget = T<{ name: string }>("greet", (d) => ({ n: d.name }));
		const rc = {
			data: { name: "Z" },
			manager: {
				t: (k: string, p?: unknown) => {
					calls.push([k, p]);
					return `R(${k})`;
				},
			},
		} as unknown as RenderContext<{ name: string }>;
		expect(await widget.renderText(rc)).toBe("R(greet)");
		expect(calls).toEqual([["greet", { n: "Z" }]]);
	});
});
