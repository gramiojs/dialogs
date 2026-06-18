import { describe, expect, it } from "bun:test";
import { Dialog } from "../src/dialog.ts";
import type { RenderedMedia } from "../src/types.ts";
import { Column } from "../src/widgets/group.ts";
import { MediaScroll, mediaScrollPage } from "../src/widgets/media.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const frames: RenderedMedia[] = [
	{ type: "photo", media: "p0" },
	{ type: "video", media: "p1" },
	{ type: "photo", media: "p2" },
];

function gallery(items = frames) {
	const scroll = MediaScroll({ id: "g", items });
	return new Dialog({
		id: "d",
		windows: [
			new Window({
				state: "m",
				text: "gallery",
				media: scroll,
				keyboard: scroll,
			}),
		],
	});
}

describe("MediaScroll", () => {
	it("renders the first frame and an `i/N` pager", async () => {
		const h = createHarness([gallery()]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		expect(h.last().mediaType).toBe("photo"); // frame 0
		expect(h.flatTexts()).toEqual(["‹", "1/3", "›"]);
	});

	it("scrolls to the next frame on a pager tap", async () => {
		const h = createHarness([gallery()]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		await h.click("g", "1"); // ‹ next ›
		expect(h.last().kind).toBe("editMedia");
		expect(h.last().mediaType).toBe("video"); // frame 1
		expect(h.flatTexts()).toEqual(["‹", "2/3", "›"]);

		const m = await h.managerFor(h.makeCtx("callback_query"));
		expect(mediaScrollPage(m, "g")).toEqual({ page: 1, count: 3 });
	});

	it("clamps out-of-range taps and ignores same-page taps", async () => {
		const changes: number[] = [];
		const scroll = MediaScroll({
			id: "g",
			items: frames,
			onPageChanged: (_ctx, page) => {
				changes.push(page);
			},
		});
		const dialog = new Dialog({
			id: "d",
			windows: [
				new Window({ state: "m", text: "g", media: scroll, keyboard: scroll }),
			],
		});
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		await h.click("g", "9"); // clamps to last frame
		expect(h.flatTexts()).toEqual(["‹", "3/3", "›"]);
		await h.click("g", "2"); // already on the last frame → no page change
		expect(h.flatTexts()).toEqual(["‹", "3/3", "›"]);
		expect(changes).toEqual([2]); // only the first tap moved the page
	});

	it("hides the pager when there is a single frame", async () => {
		const h = createHarness([gallery([{ type: "photo", media: "solo" }])]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("d");

		expect(h.last().mediaType).toBe("photo");
		expect(h.flatTexts()).toEqual([]);
	});
});
