import { Bot } from "gramio";
import {
	Back,
	BarChart,
	Barcode,
	Button,
	Column,
	Const,
	Dialog,
	DynamicMedia,
	Gauge,
	MediaScroll,
	Multi,
	QR,
	type RenderedMedia,
	Sparkline,
	StaticMedia,
	SwitchTo,
	dialogs,
} from "../src/index.ts";

/**
 * Visuals — chart text-widgets (Sparkline / BarChart / Gauge) and every media
 * widget: QR / Barcode / StaticMedia / DynamicMedia / MediaScroll.
 */

const rand = (max: number) => Math.floor(Math.random() * max);

const GALLERY: RenderedMedia[] = [
	{ type: "photo", media: "https://picsum.photos/seed/a/600" },
	{ type: "photo", media: "https://picsum.photos/seed/b/600" },
	{ type: "photo", media: "https://picsum.photos/seed/c/600" },
];

const visuals = new Dialog("visuals")
	.window("menu", {
		text: "🎨 Visuals — pick a demo:",
		keyboard: Column([
			SwitchTo("📊 Charts", "charts"),
			SwitchTo("📱 QR code", "qr"),
			SwitchTo("🏷 Barcode", "barcode"),
			SwitchTo("🏞 Static photo", "static"),
			SwitchTo("🖼 Gallery", "gallery"),
			SwitchTo("🌤 Dynamic media", "dynamic"),
		]),
	})
	.window("charts", {
		getter: () => ({
			sales: Array.from({ length: 12 }, () => rand(10) + 1),
			cpu: rand(101),
			traffic: ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => ({
				label,
				value: rand(200),
			})),
		}),
		text: Multi([
			Const("📊 Dashboard"),
			Const("Sales (last 12):"),
			Sparkline({ values: (d) => d.sales as number[] }),
			Const("CPU load:"),
			Gauge({ value: (d) => d.cpu as number, size: 10 }),
			Const("Traffic by day:"),
			BarChart({
				data: (d) => d.traffic as { label: string; value: number }[],
			}),
		]),
		keyboard: Column([
			Button("🔄 Refresh", { id: "refresh" }), // re-renders → new data
			Back("◀ Back"),
		]),
	})
	.window("qr", {
		text: "📱 Scan to visit gramio.dev:",
		media: QR({ data: "https://gramio.dev", moduleSize: 10 }),
		keyboard: Column([Back("◀ Back")]),
	})
	.window("barcode", {
		text: "🏷 A Code-128 barcode:",
		media: Barcode({ data: "GRAMIO-0001", type: "code128" }),
		keyboard: Column([Back("◀ Back")]),
	})
	.window("static", {
		text: "🏞 A fixed image attached to the window (StaticMedia):",
		media: StaticMedia("https://picsum.photos/seed/static/600"),
		keyboard: Column([Back("◀ Back")]),
	})
	.window("gallery", {
		text: "🖼 Swipe through attachments (MediaScroll):",
		media: MediaScroll({ id: "gal", items: GALLERY }),
		keyboard: Column([
			MediaScroll({ id: "gal", items: GALLERY }),
			Back("◀ Back"),
		]),
	})
	.window("dynamic", {
		// DynamicMedia resolves the image from window data at render time.
		getter: () => ({ sunny: rand(2) === 1 }),
		text: (d) => (d.sunny ? "🌞 Sunny day!" : "🌧 Rainy day!"),
		media: DynamicMedia((data) => ({
			type: "photo",
			media: data.sunny
				? "https://picsum.photos/seed/sun/500"
				: "https://picsum.photos/seed/rain/500",
		})),
		keyboard: Column([
			Button("🔁 Reroll", { id: "re" }), // re-renders → maybe other weather
			Back("◀ Back"),
		]),
	});

new Bot(process.env.BOT_TOKEN as string)
	.extend(dialogs([visuals]))
	.command("start", (ctx) => ctx.dialog.start("visuals"))
	.start();
