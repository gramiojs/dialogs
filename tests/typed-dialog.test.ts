import { describe, expect, it } from "bun:test";
import { defineDialog } from "../src/typed.ts";
import { Button, Start } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { createHarness } from "./helpers.ts";

describe("defineDialog (typed states & dialog.data)", () => {
	it("builds a working dialog with typed nav helpers (runtime)", async () => {
		const wb = defineDialog("wiz")
			.states("a", "b")
			.params<{ chatId: number }>()
			.data<{ score: number }>();

		wb.window("a", {
			getter: (ctx) => ({
				who: ctx.from?.firstName ?? "?",
				chat: ctx.params.chatId,
			}),
			text: (d) => `A:${d.who}:${d.chat}`,
			keyboard: Column([wb.switchTo("Next", "b", { id: "nx" })]),
		});
		wb.window("b", {
			text: "B",
			keyboard: Column([wb.cancel("X", { id: "cx" })]),
		});

		const wiz = wb.build();
		const h = createHarness([wiz]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("wiz", undefined, {
			data: { chatId: 5 },
		});
		expect(h.last().text).toBe("A:Тест:5");

		await h.click("nx");
		expect(h.last().text).toBe("B");
	});

	it("nav(ctx) gives typed switchTo inside raw widget handlers (runtime)", async () => {
		const wb = defineDialog("navwiz").states("a", "b");
		wb.window("a", {
			text: "A",
			keyboard: Column([
				// raw Button (not wb.button) — wb.nav(ctx) re-types ctx.switchTo
				Button("go", { id: "go", onClick: (ctx) => wb.nav(ctx).switchTo("b") }),
			]),
		});
		wb.window("b", { text: "B" });

		const h = createHarness([wb.build()]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("navwiz");
		expect(h.last().text).toBe("A");
		await h.click("go");
		expect(h.last().text).toBe("B");
	});

	it("rejects windows not declared in .states() at runtime", () => {
		const wb = defineDialog("z").states("a", "b");
		expect(() =>
			// @ts-expect-error — "c" is not a declared state
			wb.window("c", {}),
		).toThrow(/not declared/);
	});

	it("locks in compile-time state/params/data safety", () => {
		const wb = defineDialog("z2")
			.states("a", "b")
			.params<{ chatId: number }>()
			.data<{ score: number }>();

		// valid usages compile
		wb.switchTo("ok", "a", { id: "s1" });
		wb.window("a", {
			getter: (ctx) => {
				const chat: number = ctx.params.chatId; // params typed
				return { chat };
			},
			keyboard: Column([
				wb.button("hit", {
					id: "h",
					onClick: (ctx) => {
						const s: number = ctx.dialogData.score; // dialogData typed
						return ctx.switchTo("b"); // state typed
					},
				}),
			]),
		});

		// @ts-expect-error — "c" is not a declared state
		wb.switchTo("bad", "c", { id: "s2" });

		wb.window("b", {
			keyboard: Column([
				wb.button("x", {
					id: "x",
					// @ts-expect-error — "nope" is not a declared state
					onClick: (ctx) => ctx.switchTo("nope"),
				}),
				// nav(ctx) re-types a raw widget's ctx to the dialog's states
				Button("raw", {
					id: "raw",
					onClick: (ctx) => {
						wb.nav(ctx).switchTo("a"); // ✓ declared
						// @ts-expect-error — "nope" is not a declared state
						return wb.nav(ctx).switchTo("nope");
					},
				}),
			]),
		});

		// compile-time @ts-expect-error checks above are verified by typecheck:all;
		// assert at runtime that the fully-typed builder produces a real dialog
		const built = wb.build();
		expect(built.id).toBe("z2");
	});

	it("typed cross-dialog transitions via a TypedDialog ref (runtime)", async () => {
		const cb = defineDialog("child")
			.states("a", "b")
			.params<{ note: string }>();
		cb.window("a", { text: "child A" });
		cb.window("b", {
			getter: (ctx) => ({ note: ctx.params.note }),
			text: (d) => `child B note=${d.note}`,
		});
		const child = cb.build();

		const pb = defineDialog("parent").states("home");
		pb.window("home", {
			text: "parent",
			keyboard: Column([
				// target state + data checked against `child`'s types
				pb.start("Open", child, {
					id: "open",
					state: "b",
					data: { note: "hi" },
				}),
			]),
		});
		const parent = pb.build();

		const h = createHarness([parent, child]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("parent");
		expect(h.last().text).toBe("parent");

		await h.click("open"); // typed transition → child at state "b" with params
		expect(h.last().text).toBe("child B note=hi");
	});

	it("locks in compile-time transition safety", () => {
		const child = defineDialog("c").states("a", "b").params<{ note: string }>();
		const target = child.build();
		const pb = defineDialog("p").states("home");

		pb.start("ok", target, { state: "b", data: { note: "x" } }); // ✓
		Start("ok", target, { state: "a" }); // standalone Start is typed too

		// @ts-expect-error — "nope" is not a state of the target dialog
		pb.start("bad", target, { state: "nope" });
		// @ts-expect-error — target params require { note: string }
		Start("bad", target, { data: { wrong: 1 } });

		// the negatives above are enforced by typecheck:all; assert the built ref
		expect(target.id).toBe("c");
	});
});
