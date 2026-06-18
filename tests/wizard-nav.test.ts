import { describe, expect, it } from "bun:test";
import { Back, Column, Dialog, Next } from "../src/index.ts";
import { createHarness } from "./helpers.ts";

// Linear-wizard navigation: manager.next()/step() in declaration order, and the
// regression that a paired Back() must undo a Next() (next() must record history).

function wizard() {
	return new Dialog("wiz")
		.window("a", { text: "A", keyboard: Column([Next("▶", { id: "nx" })]) })
		.window("b", {
			text: "B",
			keyboard: Column([Back("◀", { id: "bk" }), Next("▶", { id: "nx2" })]),
		})
		.window("c", { text: "C", keyboard: Column([Back("◀", { id: "bk2" })]) });
}

describe("wizard navigation", () => {
	it("next() advances in declaration order and is a no-op past the last window", async () => {
		const h = createHarness([wizard()]);
		await h.reset();
		const m = await h.start("wiz");
		expect(h.last().text).toBe("A");

		await m.next();
		expect(h.last().text).toBe("B");
		await m.next();
		expect(h.last().text).toBe("C");

		const before = h.log.length;
		await m.next(); // no sibling after "c" → no-op
		expect(h.log.length).toBe(before);
		expect(h.last().text).toBe("C");
	});

	it("Back() undoes a Next() (next records history)", async () => {
		const h = createHarness([wizard()]);
		await h.reset();
		await h.start("wiz");
		expect(h.last().text).toBe("A");

		await h.click("nx"); // Next → B
		expect(h.last().text).toBe("B");

		await h.click("bk"); // Back → must return to A, not stay on B
		expect(h.last().text).toBe("A");
	});

	it("Back() chains across several Next() steps", async () => {
		const h = createHarness([wizard()]);
		await h.reset();
		const m = await h.start("wiz");

		await m.next(); // B
		await m.next(); // C
		expect(h.last().text).toBe("C");

		await m.back(); // B
		expect(h.last().text).toBe("B");
		await m.back(); // A
		expect(h.last().text).toBe("A");
	});
});
