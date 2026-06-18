import { describe, expect, it } from "bun:test";
import {
	Dialog,
	getFormValues,
	getInput,
	getPin,
	getRating,
	getReactions,
	getSelected,
	getSharedChat,
	getSharedUsers,
	getSlider,
	getToggle,
	isChecked,
} from "../src/index.ts";
import { createHarness } from "./helpers.ts";

const probe = () => new Dialog("acc").window("w", { text: "x" });

describe("widget-data accessors", () => {
	it("read back stored values with sensible defaults", async () => {
		const h = createHarness([probe()]);
		await h.reset();
		const m = await h.start("acc");

		// defaults before anything is written
		expect(getRating(m, "r")).toBe(0);
		expect(getSlider(m, "s")).toBe(0);
		expect(getPin(m, "p")).toBe("");
		expect(getToggle(m, "t")).toBe(0);
		expect(isChecked(m, "c")).toBe(false);
		expect(getInput(m, "i")).toBeUndefined();
		expect(getSelected(m, "sel")).toEqual([]);
		expect(getReactions(m, "rx")).toEqual([]);

		m.setWidgetData("r", 4);
		m.setWidgetData("s", 17);
		m.setWidgetData("p", "1234");
		m.setWidgetData("t", 1);
		m.setWidgetData("c", true);
		m.setWidgetData("i", 42);

		expect(getRating(m, "r")).toBe(4);
		expect(getSlider(m, "s")).toBe(17);
		expect(getPin(m, "p")).toBe("1234");
		expect(getToggle(m, "t")).toBe(1);
		expect(isChecked(m, "c")).toBe(true);
		expect(getInput<number>(m, "i")).toBe(42);
	});

	it("getSelected normalizes a scalar to an array and returns a copy", async () => {
		const h = createHarness([probe()]);
		await h.reset();
		const m = await h.start("acc");

		m.setWidgetData("one", "alpha");
		expect(getSelected(m, "one")).toEqual(["alpha"]);

		m.setWidgetData("many", ["a", "b"]);
		const got = getSelected(m, "many");
		got.push("c"); // mutating the returned array must not corrupt stored state
		expect(getSelected(m, "many")).toEqual(["a", "b"]);
	});

	it("getReactions returns a copy of the stored array", async () => {
		const h = createHarness([probe()]);
		await h.reset();
		const m = await h.start("acc");

		m.setWidgetData("rx", ["👍"]);
		const got = getReactions(m, "rx");
		got.push("🔥");
		expect(getReactions(m, "rx")).toEqual(["👍"]);
	});

	it("getFormValues returns a copy of manager.data.values", async () => {
		const h = createHarness([probe()]);
		await h.reset();
		const m = await h.start("acc");

		expect(getFormValues(m)).toEqual({});
		m.data.values = { name: "Ann", age: 30 };
		const values = getFormValues(m);
		expect(values).toEqual({ name: "Ann", age: 30 });
		values.name = "mutated";
		expect((m.data.values as Record<string, unknown>).name).toBe("Ann");
	});

	it("getSharedUsers / getSharedChat parse both camelCase and raw update shapes", () => {
		expect(getSharedUsers({ usersShared: { userIds: [1, 2] } })).toEqual([
			1, 2,
		]);
		expect(
			getSharedUsers({
				update: { message: { users_shared: { user_ids: [3] } } },
			}),
		).toEqual([3]);
		expect(getSharedUsers({})).toEqual([]);

		expect(getSharedChat({ chatShared: { chatId: 5 } })).toBe(5);
		expect(
			getSharedChat({ update: { message: { chat_shared: { chat_id: 7 } } } }),
		).toBe(7);
		expect(getSharedChat({})).toBeUndefined();
	});
});
