import { Bot } from "gramio";
import {
	Back,
	Button,
	Column,
	Dialog,
	Group,
	SwitchTo,
	dialogs,
} from "../src/index.ts";

/**
 * Minimal two-screen dialog with the concise builder API:
 * bare-string text, positional widget overloads, `.window()` chaining.
 */
const menu = new Dialog("menu")
	.window("main", {
		// `getter` first → `Data` ({ name }) flows into `text`/`keyboard`.
		getter: (ctx) => ({ name: ctx.from?.firstName ?? "there" }),
		text: (data) => `Hello, ${data.name}! Choose an option:`,
		keyboard: Group(
			[
				SwitchTo("⚙️ Settings", "settings"),
				Button("🔔 Ping", { id: "ping", onClick: (ctx) => ctx.answer("pong") }),
			],
			{ width: 1 },
		),
	})
	.window("settings", {
		text: "⚙️ Settings — that's all. Tap back.",
		keyboard: Column([Back("◀ Back")]),
	});

new Bot(process.env.BOT_TOKEN as string)
	.extend(dialogs([menu]))
	.command("start", (ctx) => ctx.dialog.start("menu"))
	.start();
