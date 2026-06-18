import { describe, expect, it } from "bun:test";
import type { DataDict, RenderContext } from "../src/types.ts";
import { BarChart, Gauge, Sparkline } from "../src/widgets/chart.ts";
import { Barcode, QR } from "../src/widgets/media.ts";

const rc = (data: DataDict): RenderContext => ({
	data,
	manager: undefined as never,
});

describe("Sparkline", () => {
	it("maps a series to bar glyphs", async () => {
		expect(
			await Sparkline({ values: () => [1, 2, 3, 4, 5, 6, 7, 8] }).renderText(
				rc({}),
			),
		).toBe("▁▂▃▄▅▆▇█");
	});
});

describe("Gauge", () => {
	it("renders a dial with a percentage", async () => {
		expect(await Gauge({ value: () => 60, size: 5 }).renderText(rc({}))).toBe(
			"●●●○○ 60%",
		);
	});
});

describe("BarChart", () => {
	it("renders labelled rows scaled to the max", async () => {
		const text = await BarChart({
			data: () => [
				{ label: "a", value: 5 },
				{ label: "bb", value: 10 },
			],
			width: 10,
		}).renderText(rc({}));
		expect(text).toBe("a  █████░░░░░ 5\nbb ██████████ 10");
	});
});

describe("QR & Barcode", () => {
	it("generates a PNG QR locally (etiket) by default", async () => {
		const m = await QR({ data: "https://gramio.dev" }).renderMedia(rc({}));
		expect(m?.type).toBe("photo");
		expect(m?.media).toBeInstanceOf(Blob); // an uploadable File
	});

	it("supports a URL endpoint override + dynamic data", async () => {
		const m = await QR<{ token: string }>({
			data: (d) => d.token,
			endpoint: (v) => `https://my-qr.local/${v}`,
		}).renderMedia({ data: { token: "abc" }, manager: undefined as never });
		expect(m?.media).toBe("https://my-qr.local/abc");
	});

	it("generates a barcode PNG (code128)", async () => {
		const m = await Barcode({ data: "12345", type: "code128" }).renderMedia(
			rc({}),
		);
		expect(m?.type).toBe("photo");
		expect(m?.media).toBeInstanceOf(Blob);
	});
});
