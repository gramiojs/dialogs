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
	createDialogs,
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

	// D2-2: two taps on the same stack must not lost-update each other. The plugin
	// serializes callbacks per stack key (withLock) and re-reads the store under
	// the lock; without that fix both handlers read volume=5 and the second clobbers
	// the first (final 6 instead of 7).
	it("serializes concurrent taps on the same counter (no lost update)", async () => {
		await user.sendCommand("start");
		const bubble = must(env.lastBotMessage());
		await user.on(bubble).clickByText("⚙️ Settings");

		await Promise.all([
			user.on(bubble).clickByText("➕"),
			user.on(bubble).clickByText("➕"),
		]);

		expect(
			buttonTexts(env.lastApiCall("editMessageText")?.params?.reply_markup),
		).toContain("🔊 7");
	});

	// D2-5: an over-long callback_data (Telegram's 64-byte cap) throws at keyboard
	// build with the offending widget named, instead of warning then letting the
	// send fail opaquely. The throw surfaces through the bot's onError.
	it("throws a named error when a button's callback_data exceeds 64 bytes", async () => {
		const errors: string[] = [];
		const bot = new Bot("123:test")
			.extend(
				dialogs([
					new Dialog("oversized").window("main", {
						text: "hi",
						keyboard: Column([
							Button("boom", {
								id: "x".repeat(80),
								onClick: (ctx) => ctx.answer(),
							}),
						]),
					}),
				]),
			)
			.command("start", (ctx) => ctx.dialog.start("oversized"))
			.onError(({ error }) => {
				errors.push(error instanceof Error ? error.message : String(error));
			});
		const local = new TelegramTestEnvironment(bot);

		await local.createUser({ first_name: "Eve" }).sendCommand("start");

		expect(errors.some((m) => m.includes("64") && m.includes("callback_data"))).toBe(
			true,
		);
	});
});

describe("createDialogs().background (real bot via @gramio/test)", () => {
	// D2-1: edit a user's dialog message from OUTSIDE an update (timer/webhook/worker).
	it("edits the last rendered message without an incoming update", async () => {
		const menu = new Dialog("menu")
			.window("main", { text: "main", keyboard: Column([SwitchTo("go", "two")]) })
			.window("two", { text: "second screen" });
		const { plugin, background } = createDialogs([menu]);
		const bot = new Bot("123:test")
			.extend(plugin)
			.command("start", (ctx) => ctx.dialog.start("menu"));
		const env = new TelegramTestEnvironment(bot);
		const user = env.createUser({ first_name: "Alice" });

		await user.sendCommand("start");
		const key = `grd:${user.payload.id}`;

		const manager = await background(bot, key);
		await manager.switchTo("two");

		expect(env.lastApiCall("editMessageText")?.params?.text).toBe("second screen");
	});
});
