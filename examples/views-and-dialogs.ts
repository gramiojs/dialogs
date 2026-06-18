/**
 * Coexistence: **@gramio/views** + **@gramio/dialogs** on one bot.
 *
 * `@gramio/views` is a *stateless render helper*: no plugin to extend, no
 * callback router, no state. You build a render fn bound to the current context
 * and send / edit one structured message (text + keyboard + media).
 * `@gramio/dialogs` is the opposite — a *stateful* engine that owns its callbacks
 * (the `"grd"` codec) and a navigation stack.
 *
 * They compose with zero friction:
 *  - Views renders one-shot screens (menus, cards, TMA replies). You wire its
 *    button callbacks yourself (`bot.callbackQuery(...)`): views claims no
 *    callback_data namespace, and dialogs only consumes its own `"grd"` taps and
 *    passes everything else through — so there's nothing to collide.
 *  - A view's button opens a dialog; the dialog owns that stateful screen.
 *  - Unlike scenes (see `scenes-and-dialogs.ts`), a dialog's `onClose` CAN render
 *    a view freely — views own no lifecycle / dispatch, so there's nothing to be
 *    "outside" of. Here the dialog hands straight back to the menu view.
 *
 *   /menu ─▶ view "menu"  (text + ⚙ button)
 *      tap ⚙ ─▶ dialog "settings"  (toggle theme, re-renders in place)
 *         ⬅ Back ─▶ dialog closes → onClose edits the message back to the menu
 */
import { initViewsBuilder } from "@gramio/views";
import { Bot } from "gramio";
import { Column, defineDialog, dialogs } from "../src/index.ts";

// ── Views: stateless render helpers (nothing to `.extend()`) ──
const views = initViewsBuilder<object>();

const menuView = views().render(function () {
	return this.response.text("📋 Main menu — pick something:").keyboard({
		inline_keyboard: [[{ text: "⚙ Settings", callback_data: "menu:settings" }]],
	});
});

// ── Dialog: the stateful screen a menu button opens ──
type SettingsData = { dark?: boolean };

const sb = defineDialog("settings")
	.states("main")
	.data<SettingsData>()
	.config({
		// A view renders fine from here: views own no lifecycle / active dispatch,
		// so (unlike @gramio/scenes) the dialog can hand straight back to a view.
		onClose: async (dm) => {
			await views.buildRender(dm.ctx, {}).edit(menuView);
		},
	});

sb.window("main", {
	getter: (ctx) => ({ dark: ctx.dialogData.dark ?? false }),
	text: (d) => `⚙ Settings\n• Theme: ${d.dark ? "🌙 dark" : "☀️ light"}`,
	keyboard: Column([
		sb.button("🌓 Toggle theme", {
			id: "theme",
			onClick: (ctx) => {
				ctx.dialogData.dark = !(ctx.dialogData.dark ?? false);
			},
		}),
		sb.button("⬅ Back to menu", { id: "back", onClick: (ctx) => ctx.done() }),
	]),
});

const settings = sb.build();

new Bot(process.env.BOT_TOKEN as string)
	.extend(dialogs([settings]))
	.command("menu", (ctx) => views.buildRender(ctx, {}).send(menuView))
	// A plain (non-"grd") callback: dialogs passes it through to here, where
	// `ctx.dialog` is live (the plugin is extended) and opens the dialog.
	.callbackQuery("menu:settings", (ctx) => ctx.dialog.start("settings"))
	.start();
