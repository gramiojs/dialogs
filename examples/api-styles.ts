import { Bot } from "gramio";
import {
  Back,
  Cancel,
  Column,
  Dialog,
  Form,
  Start,
  SwitchTo,
  Window,
  defineDialog,
  defineWindow,
  dialogs,
} from "../src/index.ts";

/**
 * The same little dialog, built five different ways — pick whichever reads best.
 */

// ── 1 · Chained builder (the common, concise style) ──────────────────────────
const chained = new Dialog("chained")
  .window("main", {
    text: "① Chained builder — `new Dialog(id).window().window()`",
    // Next ▶ navigates *within* this dialog; Cancel closes it → back to the hub.
    keyboard: Column([SwitchTo("Next ▶", "two"), Cancel("◀ Menu")]),
  })
  .window("two", {
    text: "Second screen.",
    // Back() is history-based, so here it returns to "main" (we switched in).
    keyboard: Column([Back("◀ Back")]),
  });

// ── 2 · Up-front windows array (explicit `new Window`) ────────────────────────
const upfront = new Dialog({
  id: "upfront",
  windows: [
    new Window({
      state: "main",
      text: "② Up-front array — `new Dialog({ windows: [new Window(...)] })`",
      // root window of a nested dialog → Cancel (done) returns to the hub.
      keyboard: Column([Cancel("◀ Back")]),
    }),
  ],
});

// ── 3 · Typed builder — typed states, typed `dialogData`, checked navigation ──
const tb = defineDialog("typed")
  .states("home", "edit")
  .data<{ count?: number }>();

tb.window("home", {
  getter: (ctx) => ({ n: ctx.dialogData.count ?? 0 }), // dialogData is typed
  text: (d) => `③ Typed builder — count = ${d.n}`,
  keyboard: Column([
    tb.button("➕ Increment", {
      id: "inc",
      onClick: (ctx) => {
        ctx.dialogData.count = (ctx.dialogData.count ?? 0) + 1;
        return ctx.show();
      },
    }),
    tb.switchTo("Edit ▶", "edit"), // "edit" ✓ — a typo would not compile
  ]),
}).window("edit", {
  text: "Edit screen.",
  // started directly at "edit" (no in-dialog history) → cancel = close to hub.
  keyboard: Column([tb.cancel("◀ Back")]),
});
const typed = tb.build();

// ── 4 · `defineWindow<Data>()` — declare the data shape once ──────────────────
type Profile = { name: string; level: number };
const v = defineWindow<Profile>();
const withWindow = new Dialog({
  id: "window",
  windows: [
    new Window({
      state: "main",
      getter: v.getter((ctx) => ({
        name: ctx.from?.firstName ?? "friend",
        level: 7,
      })),
      text: v.text((p) => `④ defineWindow — ${p.name}, level ${p.level}`),
      // root window of a nested dialog → Cancel (done) returns to the hub.
      keyboard: Column([Cancel("◀ Back")]),
    }),
  ],
});

// ── 5 · `Form(...)` factory — a validated wizard *is* a Dialog ────────────────
const form = Form({
  id: "form",
  fields: [
    {
      id: "nick",
      prompt: "⑤ Form factory — pick a nickname:",
      schema: (raw) => {
        const nick = raw.trim();
        if (!nick) throw new Error("Can't be empty.");
        return nick;
      },
    },
  ],
  onSubmit: async (ctx, values) => {
    await ctx.send(`Nice to meet you, ${values.nick}! 👋`);
    return ctx.dialog.done(); // pop the wizard → back to the hub
  },
});

// A hub that starts each style as a nested dialog — passing the Dialog *object*
// (not a string id) makes transitions typo-safe and refactor-safe.
const hub = new Dialog("hub").window("menu", {
  text: "🎛 Five ways to build a dialog (+ typed transitions) — tap one:",
  keyboard: Column([
    Start("① Chained builder", chained), // a typo'd name → compile error
    Start("② Up-front array", upfront),
    // `typed` is a TypedDialog → its `state` is checked: "edit" ✓, "nope" ✗
    Start("③ Typed builder → edit", typed, { state: "edit" }),
    Start("④ defineWindow", withWindow),
    Start("⑤ Form wizard", form),
  ]),
});

new Bot(process.env.BOT_TOKEN as string)
  .extend(dialogs([hub, chained, upfront, typed, withWindow, form]))
  .command("start", (ctx) => ctx.dialog.start("hub"))
  .start();
