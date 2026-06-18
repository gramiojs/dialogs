import { describe, expect, it } from "bun:test";
import { Form } from "../src/widgets/wizard.ts";
import { createHarness } from "./helpers.ts";

describe("Form (wizard)", () => {
	it("validates each step and submits collected values", async () => {
		let submitted: Record<string, unknown> | undefined;
		const form = Form({
			id: "f",
			fields: [
				{
					id: "name",
					prompt: "name?",
					schema: (raw) => {
						if (raw.length < 2) throw new Error("too short");
						return raw;
					},
				},
				{
					id: "age",
					prompt: "age?",
					schema: (raw) => {
						const n = Number(raw);
						if (!Number.isFinite(n)) throw new Error("nan");
						return n;
					},
				},
			],
			onSubmit: (_ctx, values) => {
				submitted = values;
			},
		});

		const h = createHarness([form]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("f");
		expect(h.last().text).toContain("name?");
		expect(h.last().text).toContain("Step 1/2");

		await h.sendText("x"); // too short → error, stays on step 1
		expect(h.last().text).toContain("too short");
		expect(h.last().text).toContain("name?");

		await h.sendText("Alice"); // valid → advance
		expect(h.last().text).toContain("age?");
		expect(h.last().text).not.toContain("too short");

		await h.sendText("30"); // valid → submit
		expect(submitted).toEqual({ name: "Alice", age: 30 });
	});

	it("accepts a Standard Schema validator", async () => {
		// a tiny inline Standard Schema (what zod/valibot/arktype expose)
		const positiveInt = {
			"~standard": {
				version: 1 as const,
				vendor: "test",
				validate: (raw: unknown) => {
					const n = Number(raw);
					return Number.isInteger(n) && n > 0
						? { value: n }
						: { issues: [{ message: "must be a positive integer" }] };
				},
			},
		};
		let result: Record<string, unknown> | undefined;
		const form = Form({
			id: "f2",
			fields: [{ id: "qty", prompt: "qty?", schema: positiveInt }],
			onSubmit: (_ctx, v) => {
				result = v;
			},
		});
		const h = createHarness([form]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("f2");

		await h.sendText("0"); // invalid
		expect(h.last().text).toContain("must be a positive integer");
		await h.sendText("7"); // valid
		expect(result).toEqual({ qty: 7 });
	});
});
