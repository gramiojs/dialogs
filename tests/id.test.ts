import { describe, expect, it } from "bun:test";
import { shortId } from "../src/id.ts";

describe("shortId", () => {
	it("never collides across many rapid (same-ms) calls", () => {
		const ids = new Set<string>();
		const n = 50_000;
		for (let i = 0; i < n; i++) ids.add(shortId());
		expect(ids.size).toBe(n); // zero collisions
	});

	it("stays short enough for the callback_data budget", () => {
		for (let i = 0; i < 1000; i++) {
			const id = shortId();
			expect(id.length).toBeLessThanOrEqual(12);
			expect(id).toMatch(/^[0-9a-z]+$/);
		}
	});
});
