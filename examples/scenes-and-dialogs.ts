/**
 * Incremental adoption: drop **@gramio/dialogs** into an existing
 * **@gramio/scenes** bot — *without* rewriting your scenes.
 *
 * The realistic migration: you already have lots of scene code (linear / text
 * wizards), and ONE screen is button-heavy (toggles, pagination, a calendar) —
 * exactly where re-rendering inline keyboards by hand in raw scenes hurts. So
 * you carve that one screen out into a dialog and let the scene hand off to it:
 *
 *   /start ─▶ scene "checkout"   (your existing flow — untouched)
 *     step "name"     "Your name?"           (message · pure scenes)
 *     step "address"  "Delivery address?"    (message · pure scenes)
 *        └─ exits the scene and hands off ▼
 *   dialog "payment"  toggle screen (re-renders) ─ "Place order" → receipt
 *
 * The handoff is **one-way** (scene → dialog) on purpose. A dialog's `onClose`
 * runs *outside* the scene's active dispatch, so it cannot resume a scene STEP
 * (scenes only expose `step.go` / `update` for the duration of their own
 * dispatch). For incremental adoption that's the right shape anyway: you migrate
 * a screen by carving out a *terminal* piece — the dialog owns it end-to-end and
 * finishes (here, by sending a receipt). Data flows back via its result, not by
 * re-entering the scene.
 *
 * Two rules that make it work:
 *  1. Extend `dialogs()` **before** `scenes()`. GramIO runs plugin middleware in
 *     registration order; the scene runs your step handler inside its own
 *     dispatch, so for `ctx.dialog` to be live *there* the dialogs plugin has to
 *     have derived first.
 *  2. The dialog hands data back via its **result** (read in `onClose`) or its
 *     own messages — never by reaching into the scene.
 *
 * Namespacing: dialog taps carry the `"grd"` callback_data codec, so they route
 * to the dialog while your scene's own messages / buttons keep routing to the
 * scene. Both plugins share one storage with separate key namespaces.
 *
 * Uses the **typed** dialog builder (`defineDialog().params<…>().data<…>()`) so
 * `ctx.params` / `ctx.dialogData` are fully typed. Don't need types? The plain
 * `new Dialog("id").window(…)` form is shorter — see `basic.ts` / `api-styles.ts`.
 */
import { Scene, scenes } from "@gramio/scenes";
import { inMemoryStorage } from "@gramio/storage";
import { Bot } from "gramio";
import {
	Column,
	type DialogManager,
	defineDialog,
	dialogs,
} from "../src/index.ts";

/** What the scene collected and handed to the dialog as start-params. */
type Order = { name: string; address: string };
/** The dialog's own mutable screen state. */
type PayData = { method?: "card" | "cash"; wrap?: boolean };

/** Slice of the dialog surface reached from inside a scene step (CROSS-PLUGIN). */
type DialogAware = { dialog: DialogManager };

// ── Dialog: the one button-heavy screen we carved out of the scene flow ──
const pb = defineDialog("payment")
	.states("main")
	.params<Order>() // ← typed start-params handed in by the scene
	.data<PayData>()
	.config({
		// Popped via `ctx.done(result)`. The closed dialog's start-params are gone
		// by now (the intent is popped before `onClose`), so the "Place order"
		// button folds everything we need into `result`. We finish by sending a
		// receipt — control is back in your normal bot flow, no scene involved.
		onClose: async (dm, result) => {
			const r = result as Order & Required<PayData>;
			await dm.ctx.bot.api.sendMessage({
				chat_id: (dm.ctx.chatId ?? dm.ctx.senderId) as number,
				text: `✅ Order placed!\n🧑 ${r.name}\n📦 ${r.address}\n💳 ${r.method}\n🎁 gift wrap: ${r.wrap ? "yes" : "no"}`,
			});
		},
	});

pb.window("main", {
	getter: (ctx) => ({
		name: ctx.params.name, // typed `Order` (not `unknown`)
		method: ctx.dialogData.method ?? "card",
		wrap: ctx.dialogData.wrap ?? false,
	}),
	text: (d) =>
		`Step 3/3 💳 Payment — ${d.name}\n` +
		`• Method: ${d.method}\n` +
		`• Gift wrap: ${d.wrap ? "on" : "off"}`,
	keyboard: Column([
		pb.button("💳 / 💵 Toggle method", {
			id: "method",
			onClick: (ctx) => {
				ctx.dialogData.method =
					ctx.dialogData.method === "cash" ? "card" : "cash";
			},
		}),
		pb.button("🎁 Toggle gift wrap", {
			id: "wrap",
			onClick: (ctx) => {
				ctx.dialogData.wrap = !(ctx.dialogData.wrap ?? false);
			},
		}),
		pb.button("✅ Place order", {
			id: "done",
			onClick: (ctx) =>
				ctx.done({
					name: ctx.params.name,
					address: ctx.params.address,
					method: ctx.dialogData.method ?? "card",
					wrap: ctx.dialogData.wrap ?? false,
				} satisfies Order & Required<PayData>),
		}),
	]),
});

const payment = pb.build();

// ── Scene: your existing text wizard (imagine many more steps like these) ──
const checkout = new Scene("checkout")
	.step("name", (c) =>
		c
			.enter((ctx) => ctx.send("Step 1/3 🧑 — what's your name?"))
			.on("message", async (ctx) => {
				// `update` with no options saves state AND advances to the next
				// declared step ("address"), whose `enter` then prompts.
				await ctx.scene.update({ name: ctx.text });
			}),
	)
	.step("address", (c) =>
		c
			.enter((ctx) => ctx.send("Step 2/3 📦 — your delivery address?"))
			.on("message", async (ctx) => {
				const state = ctx.scene.state as { name?: string };
				const order: Order = {
					name: String(state.name ?? "?"),
					address: ctx.text ?? "",
				};
				// Leave the scene — the dialog owns the rest of this flow.
				await ctx.scene.exit();
				// Hand off, passing the collected order as typed start-params.
				// `ctx.dialog` is live here because dialogs() is extended first.
				await (ctx as unknown as DialogAware).dialog.start(
					"payment",
					undefined,
					{ data: order },
				);
			}),
	);

// One shared storage — scenes and dialogs use different key namespaces
// (scenes' own keys vs the dialogs `"grd:"` prefix), so there's no collision.
const storage = inMemoryStorage();

new Bot(process.env.BOT_TOKEN as string)
	// 1️⃣ dialogs FIRST, so `ctx.dialog` is derived before the scene dispatches.
	.extend(dialogs([payment], { storage }))
	.extend(scenes([checkout], { storage }))
	.command("start", (ctx) => ctx.scene.enter(checkout))
	.start();
