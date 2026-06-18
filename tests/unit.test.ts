import { describe, expect, it } from "bun:test";
import { DIALOG_CB } from "../src/callback.ts";
import { decodeReplyData, encodeReplyData } from "../src/reply.ts";

describe("DIALOG_CB", () => {
	it("packs and unpacks", () => {
		const packed = DIALOG_CB.pack({ i: "abc12", w: "btn", p: "42" });
		expect(DIALOG_CB.filter(packed)).toBe(true);
		const u = DIALOG_CB.safeUnpack(packed);
		expect(u.success).toBe(true);
		if (u.success) expect(u.data).toEqual({ i: "abc12", w: "btn", p: "42" });
	});

	it("omits optional payload", () => {
		const packed = DIALOG_CB.pack({ i: "abc12", w: "btn" });
		const u = DIALOG_CB.safeUnpack(packed);
		expect(u.success && u.data.p).toBe("");
	});

	it("rejects foreign data", () => {
		expect(DIALOG_CB.filter("some_other_cb")).toBe(false);
	});
});

describe("reply encoding", () => {
	it("round-trips an arbitrary payload through invisible chars", () => {
		const data = DIALOG_CB.pack({ i: "xy9", w: "select", p: "item_42" });
		const label = `🔥 Кнопка${encodeReplyData(data)}`;
		const decoded = decodeReplyData(label);
		expect(decoded?.data).toBe(data);
		expect(decoded?.visible).toBe("🔥 Кнопка");
	});

	it("returns undefined when there is no invisible suffix", () => {
		expect(decodeReplyData("просто текст")).toBeUndefined();
	});

	it("preserves multibyte/emoji payloads", () => {
		const data = "тест-🎬-data";
		expect(decodeReplyData(`x${encodeReplyData(data)}`)?.data).toBe(data);
	});
});
