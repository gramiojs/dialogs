import { Bot } from "gramio";
import { Button, Column, Dialog, Start, dialogs } from "../src/index.ts";

/**
 * Typed params + nested dialogs.
 *
 * `Dialog<Params>` types `ctx.params` inside every window; a child dialog is
 * opened with `Start`/`ctx.start` and returns a result to the parent via
 * `done(result)` → `onProcessResult`.
 */

// Child: asks for a confirmation, returns a boolean to the parent.
// Put `getter` first so `Data` is inferred from it for `text`/`keyboard`.
const confirm = new Dialog<{ question: string }>("confirm").window("ask", {
	getter: (ctx) => ({ question: ctx.params.question }), // ctx.params is { question: string }
	text: (data) => data.question, // data is { question: string }
	keyboard: Column([
		Button("✅ Yes", { id: "yes", onClick: (ctx) => ctx.done(true) }),
		Button("❌ No", { id: "no", onClick: (ctx) => ctx.done(false) }),
	]),
});

// Parent: starts the child, reacts to its result.
const main = new Dialog("main", {
	onProcessResult: (manager, _startData, result) =>
		manager.clickCtx.answer({
			text: `You answered: ${result}`,
			show_alert: true,
		}),
}).window("menu", {
	text: "Delete everything?",
	keyboard: Column([
		Start("🗑 Delete…", "confirm", {
			data: { question: "Really delete everything?" },
		}),
	]),
});

new Bot(process.env.BOT_TOKEN as string)
	.extend(dialogs([main, confirm]))
	.command("start", (ctx) => ctx.dialog.start("main"))
	.start();
