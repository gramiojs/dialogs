import { describe, expect, it } from "bun:test";
import { Button, Column, Dialog } from "../src/index.ts";
import { createHarness } from "./helpers.ts";

// Dialog lifecycle hooks (onStart / onClose / onProcessResult) and the
// child→parent result handoff via ctx.done(value). Previously untested.

describe("Dialog lifecycle hooks", () => {
	it("fires onStart, onClose and onProcessResult and delivers done(value) to the parent", async () => {
		const events: string[] = [];
		let received: { startData: unknown; result: unknown } | undefined;

		const child = new Dialog("child", {
			onStart: (_m, data) => {
				events.push(`childStart:${JSON.stringify(data)}`);
			},
			onClose: (_m, result) => {
				events.push(`close:${result}`);
			},
		}).window("c", {
			text: "child",
			keyboard: Column([
				Button("done", { id: "d", onClick: (ctx) => ctx.done(42) }),
			]),
		});

		const parent = new Dialog("parent", {
			onStart: (_m, data) => {
				events.push(`parentStart:${JSON.stringify(data)}`);
			},
			onProcessResult: (_m, startData, result) => {
				received = { startData, result };
				events.push(`result:${result}`);
			},
		}).window("p", {
			text: "parent",
			keyboard: Column([
				Button("open", {
					id: "o",
					onClick: (ctx) => ctx.start(child, undefined, { data: { x: 1 } }),
				}),
			]),
		});

		const h = createHarness([parent, child]);
		await h.reset();

		await h.start("parent");
		await h.click("o"); // parent opens child with { x: 1 }
		expect(h.last().text).toBe("child");

		await h.click("d"); // child done(42)

		// onProcessResult got the child's startData + the result value
		expect(received).toEqual({ startData: { x: 1 }, result: 42 });
		expect(events).toContain("parentStart:undefined");
		expect(events).toContain('childStart:{"x":1}');
		expect(events).toContain("close:42");
		expect(events).toContain("result:42");

		// the parent re-rendered after the child closed
		expect(h.last().text).toBe("parent");
	});

	it("runs onClose even when a dialog is the only one on the stack", async () => {
		const events: string[] = [];
		const solo = new Dialog("solo", {
			onClose: (_m, result) => {
				events.push(`close:${result}`);
			},
		}).window("s", {
			text: "solo",
			keyboard: Column([
				Button("x", { id: "x", onClick: (ctx) => ctx.done("bye") }),
			]),
		});

		const h = createHarness([solo]);
		await h.reset();
		await h.start("solo");
		await h.click("x");

		expect(events).toEqual(["close:bye"]);
	});
});
