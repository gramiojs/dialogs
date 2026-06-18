import { beforeEach, describe, expect, it } from "bun:test";
/**
 * Integration tests driving the engine through a **real** GramIO `Bot` with the
 * `dialogs()` plugin extended, using `@gramio/test`'s `TelegramTestEnvironment`.
 *
 * Unlike the rest of the suite (which exercises `DialogManager` directly via the
 * fake-ctx harness in `helpers.ts`), this file goes through the actual plugin
 * wiring — `.extend(dialogs([...]))`, `ctx.dialog.start`, callback routing, and
 * the API the bot really calls — so it catches regressions the unit harness can't.
 */
import { TelegramTestEnvironment } from "@gramio/test";
import { Bot } from "gramio";
import {
	Back,
	Button,
	Column,
	Counter,
	Dialog,
	Group,
	SwitchTo,
	dialogs,
} from "../src/index.ts";

/** Narrow `T | undefined` to `T`, failing the test with a clear message if absent. */
function must<T>(value: T | undefined, message = "expected a value"): T {
	if (value === undefined) throw new Error(message);
	return value;
}

/** Flatten the visible texts of an inline keyboard from a recorded API call. */
function buttonTexts(markup: unknown): string[] {
	const kb = (markup as { inline_keyboard?: { text: string }[][] })
		?.inline_keyboard;
	return (kb ?? []).flat().map((b) => b.text);
}

/** A fresh bot wired with a two-window menu dialog + a non-dialog command. */
function buildBot() {
	const menu = new Dialog("menu")
		.window("main", {
			getter: (ctx) => ({ name: ctx.from?.firstName ?? "there" }),
			text: (d) => `Hello, ${d.name}! Choose an option:`,
			keyboard: Group(
				[
					SwitchTo("⚙️ Settings", "settings"),
					Button("🔔 Ping", {
						id: "ping",
						onClick: (ctx) => ctx.answer("pong"),
					}),
				],
				{ width: 1 },
			),
		})
		.window("settings", {
			text: "⚙️ Settings",
			keyboard: Column([
				Counter({
					id: "volume",
					default: 5,
					min: 0,
					max: 10,
					text: (d) => `🔊 ${d.value}`,
				}),
				Back("◀ Back"),
			]),
		});

	return new Bot("123:test")
		.extend(dialogs([menu]))
		.command("start", (ctx) => ctx.dialog.start("menu"))
		.command("help", (ctx) => ctx.send("help!"));
}

describe("dialogs() plugin (real bot via @gramio/test)", () => {
	let env: TelegramTestEnvironment;
	let user: ReturnType<TelegramTestEnvironment["createUser"]>;

	beforeEach(() => {
		env = new TelegramTestEnvironment(buildBot());
		user = env.createUser({ first_name: "Alice" });
	});

	it("/start renders the main window with getter text and buttons", async () => {
		await user.sendCommand("start");

		const call = env.lastApiCall("sendMessage");
		expect(call?.params.text).toBe("Hello, Alice! Choose an option:");
		expect(buttonTexts(call?.params.reply_markup)).toEqual([
			"⚙️ Settings",
			"🔔 Ping",
		]);
	});

	it("SwitchTo edits the message in place (no new send)", async () => {
		await user.sendCommand("start");
		const bubble = must(env.lastBotMessage());

		await user.on(bubble).clickByText("⚙️ Settings");

		expect(env.lastApiCall("editMessageText")?.params?.text).toBe("⚙️ Settings");
		// exactly one send (the initial /start render); navigation edits, never re-sends
		expect(env.filterApiCalls("sendMessage").length).toBe(1);
	});

	it("Counter increments and re-renders the value", async () => {
		await user.sendCommand("start");
		const bubble = must(env.lastBotMessage());
		await user.on(bubble).clickByText("⚙️ Settings");
		expect(
			buttonTexts(env.lastApiCall("editMessageText")?.params?.reply_markup),
		).toContain("🔊 5");

		await user.on(bubble).clickByText("➕");

		expect(
			buttonTexts(env.lastApiCall("editMessageText")?.params?.reply_markup),
		).toContain("🔊 6");
	});

	it("Button onClick answers the callback query", async () => {
		await user.sendCommand("start");
		const bubble = must(env.lastBotMessage());

		await user.on(bubble).clickByText("🔔 Ping");

		// the engine also auto-closes the callback with an empty answer afterwards,
		// so assert that *some* answerCallbackQuery carried the onClick's text.
		const texts = env
			.filterApiCalls("answerCallbackQuery")
			.map((c) => c.params?.text);
		expect(texts).toContain("pong");
	});

	it("Back returns to the previous window", async () => {
		await user.sendCommand("start");
		const bubble = must(env.lastBotMessage());
		await user.on(bubble).clickByText("⚙️ Settings");

		await user.on(bubble).clickByText("◀ Back");

		expect(env.lastApiCall("editMessageText")?.params?.text).toBe(
			"Hello, Alice! Choose an option:",
		);
	});

	it("isolates stacks per user", async () => {
		const bob = env.createUser({ first_name: "Bob" });

		await user.sendCommand("start");
		await bob.sendCommand("start");

		const forBob = env
			.filterApiCalls("sendMessage")
			.find((c) => String(c.params.text ?? "").includes("Bob"));
		expect(forBob?.params.text).toBe("Hello, Bob! Choose an option:");
	});

	it("lets non-dialog updates fall through to other handlers", async () => {
		await user.sendCommand("help");

		expect(env.lastApiCall("sendMessage")?.params.text).toBe("help!");
	});
});
