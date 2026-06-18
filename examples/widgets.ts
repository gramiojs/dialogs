import { Bot } from "gramio";
import {
	Accordion,
	AsyncSelect,
	Back,
	Breadcrumbs,
	Button,
	Calendar,
	Case,
	Checkbox,
	Column,
	Confirm,
	Const,
	Counter,
	CurrentPage,
	Dialog,
	FirstPage,
	Form,
	Format,
	Grid,
	LastPage,
	List,
	Multi,
	Multiselect,
	NextPage,
	PinPad,
	PrevPage,
	Progress,
	Radio,
	Rating,
	Row,
	ScrollingGroup,
	Select,
	Slider,
	Start,
	Stepper,
	SwitchTo,
	Tabs,
	TagInput,
	TextInput,
	Toggle,
	Url,
	addTag,
	dialogs,
	getInput,
	getPin,
	getRating,
	getSelected,
	getSlider,
	getTab,
	getTags,
	getToggle,
	isChecked,
} from "../src/index.ts";

/**
 * One cohesive widget gallery — a runnable cheat-sheet of (almost) the whole
 * widget API: text, stateful (+ getSelected/getToggle/isChecked), form widgets +
 * a validated Form wizard (+ getPin), data/selection, Calendar, paginated list,
 * and TextInput validation (+ getInput).
 */

interface Item {
	id: string;
	title: string;
}
const TAGS: Item[] = [
	{ id: "news", title: "News" },
	{ id: "deals", title: "Deals" },
	{ id: "tips", title: "Tips" },
];

const CRUMBS = { menu: "🏠 Gallery", data: "🗂 Data" };

const COLORS = [
	{ id: "red", emoji: "🟥" },
	{ id: "green", emoji: "🟩" },
	{ id: "blue", emoji: "🟦" },
	{ id: "black", emoji: "⬛" },
];
const PRODUCTS = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `📦 Product #${i + 1}`,
}));
const TAB_CONTENT: Record<string, string> = {
	overview: "📋 A premium widget that does it all.",
	specs: "⚙️ 12 cores · 32 GB · 1 TB · 120 Hz",
	reviews: "⭐⭐⭐⭐½ — best purchase this year!",
};

const demo = new Dialog("widgets")
	.window("menu", {
		text: "🧩 Widget gallery — pick a category:",
		keyboard: Column([
			SwitchTo("📝 Text", "text"),
			SwitchTo("🎛 Stateful", "stateful"),
			SwitchTo("✍️ Forms", "forms"),
			SwitchTo("🗂 Data & selection", "data"),
			SwitchTo("📅 Calendar", "calendar"),
			SwitchTo("📜 Long list", "list"),
			SwitchTo("⌨️ Input", "input"),
			Url("🌐 GramIO docs", "https://gramio.dev"),
		]),
	})
	// ─── text widgets: Const / Format / Case / Progress / List ───
	.window("text", {
		getter: () => ({
			status: "active",
			progress: 65,
			logs: ["build", "test", "deploy"],
		}),
		text: Multi([
			Const("📝 Text widgets:"),
			Format("Status: {status}"), // {key} interpolation
			Case("status", {
				active: Const("🟢 running"),
				default: Const("⚪ idle"),
			}),
			Progress({ value: (d) => d.progress as number }),
			List<string>({
				items: (d) => d.logs as string[],
				item: (line, i) => `${i + 1}. ${line}`,
			}),
		]),
		keyboard: Column([Back("◀ Back")]),
	})
	// ─── stateful widgets keep their own state; read it with the getX helpers ───
	.window("stateful", {
		getter: (ctx) => ({
			tags: TAGS,
			subs: getSelected(ctx.dialog, "subs"),
			notify: isChecked(ctx.dialog, "notify"),
			theme: getToggle(ctx.dialog, "theme"),
		}),
		text: (d) =>
			`🎛 notify=${d.notify ? "on" : "off"} · theme#${d.theme} · subs=[${d.subs.join(",")}]`,
		keyboard: Column([
			Counter({
				id: "qty",
				default: 1,
				min: 0,
				max: 9,
				text: (d) => `Qty: ${d.value}`,
			}),
			Checkbox({
				id: "notify",
				checkedText: "🔔 Notify: on",
				uncheckedText: "🔕 Notify: off",
			}),
			Toggle<Item>({
				id: "theme",
				items: TAGS,
				itemId: (t) => t.id,
				text: (s) => `Theme: ${s.item.title}`,
			}),
			Radio<Item>({
				id: "plan",
				items: (d) => d.tags as Item[],
				itemId: (t) => t.id,
				checkedText: (s) => `🔘 ${s.item.title}`,
				uncheckedText: (s) => `⚪ ${s.item.title}`,
			}),
			Multiselect<Item>({
				id: "subs",
				items: (d) => d.tags as Item[],
				itemId: (t) => t.id,
				checkedText: (s) => `✅ ${s.item.title}`,
				uncheckedText: (s) => `⬜ ${s.item.title}`,
			}),
			Back("◀ Back"),
		]),
	})
	// ─── form widgets submenu: Rating / Slider / PinPad / TagInput / Confirm + Form ───
	.window("forms", {
		text: "✍️ Forms — pick a widget:",
		keyboard: Column([
			SwitchTo("⭐ Rating", "rating"),
			SwitchTo("🎚 Slider", "slider"),
			SwitchTo("🔢 PIN pad", "pin"),
			SwitchTo("🏷 Tags", "tags"),
			SwitchTo("🗑 Confirm", "confirm"),
			Start("🧙 Sign-up wizard", "signup"),
			Back("◀ Back"),
		]),
	})
	.window("rating", {
		getter: (ctx) => ({ stars: getRating(ctx.dialog, "stars") }),
		text: (d) =>
			d.stars ? `Thanks for the ${d.stars}/5! ⭐` : "How would you rate us?",
		keyboard: Column([Rating({ id: "stars" }), Back("◀ Forms")]),
	})
	.window("slider", {
		getter: (ctx) => ({ vol: getSlider(ctx.dialog, "vol") }),
		text: (d) => `🔊 Volume: ${d.vol}%`,
		keyboard: Column([
			Slider({ id: "vol", min: 0, max: 100, step: 10, default: 50 }),
			Back("◀ Forms"),
		]),
	})
	.window("pin", {
		getter: (ctx) => ({ pin: getPin(ctx.dialog, "pin") }),
		text: (d) => `🔐 Enter a 4-digit PIN (so far: ${d.pin || "····"})`,
		keyboard: Column([
			PinPad({
				id: "pin",
				length: 4,
				onComplete: (ctx, code) =>
					ctx.answer({ text: `PIN set to ${code} ✅`, show_alert: true }),
			}),
			Back("◀ Forms"),
		]),
	})
	.window("tags", {
		getter: (ctx) => ({ tags: getTags(ctx.dialog, "tags") }),
		text: (d) =>
			d.tags.length
				? `🏷 ${d.tags.join("  ")}\n\nSend a word to add · tap a chip to remove.`
				: "🏷 Send a word to add your first tag.",
		keyboard: Column([TagInput({ id: "tags", max: 8 }), Back("◀ Forms")]),
		onMessage: (ctx) => {
			if (!ctx.text) return;
			addTag(ctx.dialog, "tags", ctx.text, 8);
			return ctx.dialog.show();
		},
	})
	.window("confirm", {
		text: "Delete your account? This cannot be undone.",
		keyboard: Column([
			Confirm({
				id: "del",
				yesText: "🗑 Delete",
				noText: "↩️ Keep it",
				onConfirm: (ctx) => ctx.answer("Account deleted (just kidding) 😅"),
				onCancel: (ctx) => ctx.switchTo("forms"),
			}),
			Back("◀ Forms"),
		]),
	})
	// ─── data & selection submenu: Tabs / Accordion / Grid / AsyncSelect ───
	.window("data", {
		text: Multi([Breadcrumbs({ labels: CRUMBS }), Const("Pick a demo:")]),
		keyboard: Column([
			SwitchTo("🗂 Tabs", "tabs"),
			SwitchTo("❓ Accordion", "accordion"),
			SwitchTo("🎨 Grid", "grid"),
			SwitchTo("📚 Async list", "async"),
			Back("◀ Back"),
		]),
	})
	.window("tabs", {
		getter: (ctx) => ({ tab: getTab(ctx.dialog, "tab", "overview") }),
		text: (d) => `📦 Product\n\n${TAB_CONTENT[d.tab] ?? ""}`,
		keyboard: Column([
			Tabs({
				id: "tab",
				default: "overview",
				items: [
					{ id: "overview", label: "Overview" },
					{ id: "specs", label: "Specs" },
					{ id: "reviews", label: "Reviews" },
				],
			}),
			Back("◀ Data"),
		]),
	})
	.window("accordion", {
		text: "❓ Tap a question:",
		keyboard: Column([
			Accordion({
				id: "faq",
				sections: [
					{
						id: "ship",
						header: "🚚 How long is shipping?",
						body: Column([Url("📦 Track an order", "https://gramio.dev")]),
					},
					{
						id: "ret",
						header: "↩️ Return policy?",
						body: Column([
							Button("Start a return", {
								id: "return",
								onClick: (ctx) => ctx.answer("Return started ✅"),
							}),
						]),
					},
				],
			}),
			Back("◀ Data"),
		]),
	})
	.window("grid", {
		text: "🎨 Pick a color:",
		keyboard: Column([
			Grid<{ id: string; emoji: string }>({
				id: "color",
				items: () => COLORS,
				itemId: (c) => c.id,
				text: (c) => c.emoji,
				width: 4,
				onClick: (ctx, id) => ctx.answer(`You picked ${id} 🎨`),
			}),
			Back("◀ Data"),
		]),
	})
	.window("async", {
		text: "📚 Browse the catalog:",
		keyboard: Column([
			AsyncSelect<{ id: number; name: string }>({
				id: "prod",
				pageSize: 6,
				load: ({ offset, limit }) => PRODUCTS.slice(offset, offset + limit),
				itemId: (p) => p.id,
				text: (p) => p.name,
				onClick: (ctx, id) => ctx.answer(`Opened product #${id}`),
			}),
			Back("◀ Data"),
		]),
	})
	// ─── calendar with min date + marked days ───
	.window("calendar", {
		text: "Pick a date:",
		keyboard: Column([
			Calendar({
				id: "cal",
				minDate: new Date(Date.UTC(2020, 0, 1)),
				marks: (date) => (date.getUTCDate() === 1 ? "•1" : undefined),
				onSelect: (ctx, date) => ctx.answer(date.toISOString().slice(0, 10)),
			}),
			Back("◀ Back"),
		]),
	})
	// ─── paginated list with standalone pagers + a page indicator ───
	.window("list", {
		text: CurrentPage("scroll", (page, total) => `📜 Page ${page}/${total}`),
		getter: () => ({
			rows: Array.from({ length: 50 }, (_, i) => ({
				id: i,
				title: `Item #${i + 1}`,
			})),
		}),
		keyboard: Column([
			ScrollingGroup(
				[
					Select<{ id: number; title: string }>({
						id: "row",
						items: (d) => d.rows as { id: number; title: string }[],
						itemId: (r) => r.id,
						text: (s) => s.item.title,
						onClick: (ctx, id) => ctx.answer(`Picked ${id}`),
					}),
				],
				{ id: "scroll", height: 6, pager: false }, // pager off → use standalone
			),
			Row([
				FirstPage({ scrollId: "scroll" }),
				PrevPage({ scrollId: "scroll" }),
				NextPage({ scrollId: "scroll" }),
				LastPage({ scrollId: "scroll" }),
			]),
			Back("◀ Back"),
		]),
	})
	// ─── typed text input with validation; read it back with getInput ───
	.window("input", {
		getter: (ctx) => ({ last: getInput<number>(ctx.dialog, "num") }),
		text: (d) =>
			d.last !== undefined
				? `Last number: ${d.last}. Send another:`
				: "Send me a number:",
		input: TextInput<number>({
			id: "num",
			parse: (t) => {
				const n = Number(t);
				if (!Number.isFinite(n)) throw new Error("not a number");
				return n;
			},
			onSuccess: (ctx, n) => ctx.send(`Got ${n} (×2 = ${n * 2})`),
			onError: (ctx) => ctx.send("That's not a number — try again."),
		}),
		keyboard: Column([Back("◀ Back")]),
	});

// A validated wizard — `schema` accepts any Standard Schema (zod / valibot /
// arktype) or a plain `(raw) => value` parser that throws to reject.
const signup = Form({
	id: "signup",
	header: Stepper({
		steps: ["Name", "Age", "Email"],
		current: (d) => d.step as number,
	}),
	fields: [
		{
			id: "name",
			prompt: "👤 What should I call you?",
			schema: (raw) => {
				const name = raw.trim();
				if (name.length < 2) throw new Error("That name is too short.");
				return name;
			},
		},
		{
			id: "age",
			prompt: "🎂 How old are you?",
			schema: (raw) => {
				const n = Number(raw);
				if (!Number.isInteger(n) || n < 1 || n > 150)
					throw new Error("Please enter a valid age.");
				return n;
			},
		},
		{
			id: "email",
			prompt: "📧 Your email?",
			schema: (raw) => {
				if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim()))
					throw new Error("That doesn't look like an email.");
				return raw.trim();
			},
		},
	],
	onSubmit: async (ctx, v) => {
		await ctx.send(`🎉 All set, ${v.name}!\nAge: ${v.age}\nEmail: ${v.email}`);
		return ctx.dialog.done(); // pop the wizard → back to the "forms" window
	},
});

new Bot(process.env.BOT_TOKEN as string)
	.extend(dialogs([demo, signup]))
	.command("start", (ctx) => ctx.dialog.start("widgets"))
	.start();
