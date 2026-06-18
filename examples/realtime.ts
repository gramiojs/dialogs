import { Bot } from "gramio";
import {
	stream,
	Back,
	Button,
	Cancel,
	Column,
	Const,
	ContactRequest,
	Countdown,
	Dialog,
	LiveProgress,
	LocationButton,
	Multi,
	Poll,
	Reactions,
	RequestChat,
	RequestUser,
	Row,
	Spinner,
	StarsButton,
	SwitchInlineQuery,
	SwitchTo,
	Url,
	WebApp,
	createDialogs,
	getReactions,
	getSharedChat,
	getSharedUsers,
	typing,
} from "../src/index.ts";

/**
 * Real-time & Telegram-native surfaces in one bot:
 *  - live widgets (Spinner / Countdown / LiveProgress) animated from OUTSIDE the
 *    handler via the background manager — the right way to "tick";
 *  - native Poll / quiz, Reactions, and reply-keyboard pickers (Request*);
 *  - Telegram Stars payments + AI token streaming (`sendMessageDraft`).
 * Also shows WebApp / SwitchInlineQuery / Cancel buttons and a custom callback
 * prefix via the `callback` plugin option (internally `makeCodec({ name })`).
 */

// Swap for your LLM's streaming response — any `AsyncIterable<string>`.
async function* fakeTokens(): AsyncGenerator<string> {
	const text = "GramIO dialogs make rich, stateful Telegram UIs effortless.";
	for (const word of text.split(" ")) {
		await new Promise((r) => setTimeout(r, 150));
		yield `${word} `;
	}
}

const rt = new Dialog("rt", {
	onStart: (m) => {
		m.data.deadline = Date.now() + 30_000;
		m.data.progress = 0;
	},
})
	.window("menu", {
		text: "⚡ Real-time & native demos:",
		keyboard: Column([
			SwitchTo("🎬 Live widgets", "live"),
			SwitchTo("📊 Poll & quiz", "poll"),
			SwitchTo("❤️ Reactions", "react"),
			SwitchTo("👤 Native pickers", "pickers"),
			SwitchTo("⭐ Buy with Stars", "buy"),
			SwitchTo("🤖 Stream AI", "ai"),
			Row([
				Url("📈 Docs", "https://gramio.dev"),
				WebApp("🖥 Dashboard", "https://gramio.dev"),
				SwitchInlineQuery({ text: "↗️ Share", query: "gramio dialogs" }),
			]),
			Cancel("✖ Close"),
		]),
	})
	// LIVE — re-rendered on a timer by the background manager (see command below)
	.window("live", {
		text: Multi([
			Const("⚡ Updating every 2s from the background manager:"),
			Countdown({
				until: (d) => (d.dialogData as { deadline?: number }).deadline ?? 0,
				doneText: "⏰ Time's up!",
			}),
			LiveProgress({
				value: (d) => (d.dialogData as { progress?: number }).progress ?? 0,
				label: "Build",
			}),
			Spinner({ id: "spin", label: "working…" }),
		]),
		keyboard: Column([Back("◀ Back")]),
	})
	// NATIVE — Poll / quiz sent to the chat
	.window("poll", {
		text: "Send a native poll or quiz to the chat:",
		keyboard: Column([
			Poll({
				id: "poll",
				text: "📊 Send a poll",
				question: "Favorite language?",
				options: ["TypeScript", "Rust", "Go", "Python"],
			}),
			Poll({
				id: "quiz",
				text: "🧠 Send a quiz",
				question: "What is 2 + 2?",
				options: ["3", "4", "5"],
				quiz: true,
				correctOptionId: 1,
			}),
			Back("◀ Back"),
		]),
	})
	.window("react", {
		getter: (ctx) => ({ picked: getReactions(ctx.dialog, "rx") }),
		text: (d) =>
			d.picked.length
				? `You reacted ${d.picked.join(" ")}`
				: "How do you feel?",
		keyboard: Column([
			Reactions({ id: "rx", items: ["👍", "❤️", "🔥", "😮", "😢"] }),
			Back("◀ Back"),
		]),
	})
	// Request buttons must live in a `reply: true` window; results arrive as
	// service messages, read in `onMessage`.
	.window("pickers", {
		reply: true,
		text: "Use the buttons below to share something 👇",
		keyboard: Column([
			RequestUser({ text: "👤 Pick a user" }),
			RequestChat({ text: "💬 Pick a group" }),
			ContactRequest({ text: "📞 Share my contact" }),
			LocationButton({ text: "📍 Share my location" }),
			Back("◀ Back"),
		]),
		onMessage: (ctx) => {
			const users = getSharedUsers(ctx);
			const chat = getSharedChat(ctx);
			if (users.length)
				return ctx.send(`✅ Got user id(s): ${users.join(", ")}`);
			if (chat !== undefined) return ctx.send(`✅ Got chat id: ${chat}`);
		},
	})
	// PAYMENTS — Telegram Stars
	.window("buy", {
		text: "Unlock Pro for a month — 1 ⭐",
		keyboard: Column([
			StarsButton({
				id: "pro",
				text: "⭐ Buy Pro · 1",
				title: "Pro plan",
				description: "Unlimited everything for 30 days.",
				stars: 1,
				onInvoice: (ctx) =>
					ctx.answer("Invoice sent — complete the payment ⭐"),
			}),
			Back("◀ Back"),
		]),
	})
	// AI — token streaming via sendMessageDraft (private chats)
	.window("ai", {
		text: "🤖 Streams a reply via sendMessageDraft:",
		keyboard: Column([
			Button("✨ Generate", {
				id: "gen",
				onClick: (ctx) => stream(ctx, fakeTokens(), { throttleMs: 600 }),
			}),
			Back("◀ Back"),
		]),
	});

// `callback: { name }` swaps the callback_data prefix tag (internally makeCodec).
const { plugin, background } = createDialogs([rt], {
	callback: { name: "rt" },
});
const bot = new Bot(process.env.BOT_TOKEN as string).extend(plugin);

// ⚠️ Stars payments need TWO bot-level handlers, or the purchase never completes:
bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery({ ok: true }));
bot.on("successful_payment", (ctx) =>
	ctx.send("✅ Payment received — Pro unlocked! 🎉"),
);

bot.command("start", async (ctx) => {
	await typing(ctx); // show "typing…" while we boot the demo
	await ctx.dialog.start("rt");

	// Re-render the live window on a timer to animate its widgets. The key must
	// match the plugin's default getStackKey: `grd:<senderId>`.
	const key = `grd:${ctx.senderId}`;
	let progress = 0;
	const timer = setInterval(async () => {
		progress = Math.min(100, progress + 10);
		try {
			const manager = await background(bot, key);
			manager.data.progress = progress;
			await manager.show(); // edits the message in place
		} catch {
			clearInterval(timer);
			return;
		}
		if (progress >= 100) clearInterval(timer);
	}, 2000);
});

bot.start();
