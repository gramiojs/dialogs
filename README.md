# @gramio/dialogs

[![npm](https://img.shields.io/npm/v/@gramio/dialogs?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.com/package/@gramio/dialogs)
[![npm downloads](https://img.shields.io/npm/dw/@gramio/dialogs?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.com/package/@gramio/dialogs)
[![CI](https://github.com/gramiojs/dialogs/actions/workflows/publish.yml/badge.svg)](https://github.com/gramiojs/dialogs/actions/workflows/publish.yml)

Declarative, stateful **dialogs** and reusable **widgets** for
[GramIO](https://gramio.dev) — you describe a screen as a tree of widgets, and the
engine handles message send/edit/delete, `callback_data` routing, and stack-based
navigation. Inspired by [aiogram_dialog](https://github.com/Tishka17/aiogram_dialog),
reimagined for TypeScript.

> [!WARNING]
> **Work in progress.** This library is under active development and the public
> API may change between releases without notice. Pin an exact version and review
> the changelog before upgrading.

## Install

```bash
npm install @gramio/dialogs
# bun add @gramio/dialogs · pnpm add @gramio/dialogs · yarn add @gramio/dialogs
```

`gramio` is a peer dependency. Works on Node ≥ 20, Bun, and Deno; ships ESM, CJS,
and `.d.ts`. Persistence plugs into any [`@gramio/storage`](https://gramio.dev)
adapter (in-memory, Redis, Cloudflare KV, …).

## Mental model in 30 seconds

```
Dialog ("menu")  ── a state group: one set of related screens + lifecycle
 ├─ Window "main"      ── one screen for one state key
 │    ├─ getter        ── load data for this render
 │    ├─ text/media    ── what to show
 │    └─ keyboard      ── a widget tree (buttons, layout, stateful, …)
 └─ Window "settings"
        └─ …

         ▲ rendered to ONE Telegram message, edited in place on every action
```

- **`Dialog`** — a group of windows that share state, data, and lifecycle hooks
  (`onStart` / `onClose` / `access`). One dialog id = one "screen flow".
- **`Window`** — a single screen bound to a **state key**. It owns the `text`,
  `media`, and `keyboard` widget tree, plus an optional `getter` and input handler.
- **`ctx.dialog`** — the navigation surface on every update: `start` / `switchTo`
  / `back` / `next` / `done`, plus the data buckets (`params` / `dialogData`).

You never call `editMessageText`, build `callback_data`, or write an FSM. You
mutate state and the active window **re-renders itself** into the same message.

## 5-minute example

```ts
import { Bot } from "gramio";
import {
  Dialog, dialogs, Group, Column, SwitchTo, Back, Button, Counter,
} from "@gramio/dialogs";

const menu = new Dialog("menu")
  .window("main", {
    getter: (ctx) => ({ name: ctx.from?.firstName ?? "there" }),
    text: (d) => `Hello, ${d.name}! Choose an option:`,
    keyboard: Group([
      SwitchTo("⚙️ Settings", "settings"),
      Button("🔔 Ping", { id: "ping", onClick: (ctx) => ctx.answer("pong") }),
    ], { width: 1 }),
  })
  .window("settings", {
    text: "⚙️ Settings",
    keyboard: Column([
      Counter({ id: "volume", default: 5, min: 0, max: 10, text: (d) => `🔊 ${d.value}` }),
      Back("◀ Back"),
    ]),
  });

new Bot(process.env.BOT_TOKEN!)
  .extend(dialogs([menu]))
  .command("start", (ctx) => ctx.dialog.start("menu"))
  .start();
```

What you **didn't** write: no `editMessageText`, no `callback_data` strings, no
`bot.callbackQuery(...)` routing, no per-user FSM, no manual "which message do I
edit?" bookkeeping. `SwitchTo`, `Counter`, and `Back` carry their own behaviour.

## What happens when an update arrives

```
message | callback_query
        │
        ▼
  derive ctx.dialog (load stack from storage, key: grd:<senderId>)
        │
   ┌────┴───────────────┐
callback_query        message
   │                     │
unpack callback_data   reply-keyboard payload? ─yes─► route as a callback
   │                     │ no
ours? ─no─► next()     window.input → onMessage
   │ yes                 │
intent == active        handled ─► persist
dialog instance?        else ────► next()  (not ours → other handlers run)
   │   └─no─► onStale (silent answer by default)
access ok? ─no─► onAccessDenied
   │ yes
widget onClick mutates state
   │
re-render (Edit) ─► persist stack
```

The plugin **owns only what it recognises**: a tap whose `callback_data` doesn't
match the active dialog instance falls straight through to `next()`, so dialogs
coexist with your normal `command` / `on` handlers.

## What goes where — the decision guide

| You want to… | Put it on… | Why |
|---|---|---|
| Load data for a screen | `getter` (window, or dialog-level) | runs before each render; its output is the `data` your `text`/`keyboard` see |
| Decide what to show | `text` / `media` / `keyboard` on the window | declarative; re-rendered after every action |
| Pass a one-off arg into a run | `start(id, state, { data })` → `ctx.params` | immutable for the life of that dialog instance |
| Keep mutable state across screens | `ctx.dialogData` | survives `switchTo` / `next` within the dialog |
| Store a widget's own value | give the widget an `id` → `ctx.widgetData(id)` / typed accessors | persisted per widget, per dialog instance |
| React to a tap | `onClick` on a `Button` | receives the nav surface (`ctx.switchTo`, …) |
| Consume free text | `input` (e.g. `TextInput`) or `onMessage` | `input` runs first; falls through if it doesn't handle it |
| Hand a result back to the opener | `ctx.done(result)` | the parent dialog's `onProcessResult` receives it |
| Guard who may interact | `access` / `onAccessDenied` | runs on every update routed into the dialog |
| Edit a dialog from outside a handler | `createDialogs(...).background(...)` | headless render that edits the last message |

## The three data buckets

A dialog instance carries three independent stores. Keep them straight and most
"where does this value live?" questions disappear.

```ts
const confirm = new Dialog<{ orderId: number }>("confirm").window("ask", {
  // params: the immutable data passed to start() — typed by Dialog<Params>
  getter: (ctx) => ({ orderId: ctx.params.orderId, attempts: ctx.dialogData.tries ?? 0 }),
  text: (d) => `Confirm order #${d.orderId}? (tries: ${d.attempts})`,
  keyboard: Column([
    Button("Retry", { id: "retry", onClick: (ctx) => {
      ctx.dialogData.tries = (ctx.dialogData.tries ?? 0) + 1; // mutable, survives re-render
      return ctx.show();
    }}),
    Button("Yes", { id: "y", onClick: (ctx) => ctx.done(true) }), // result → opener
  ]),
});
```

| Bucket | Set by | Read as | Lifetime |
|---|---|---|---|
| **start params** | `start(id, state, { data })` | `ctx.params` (readonly) | the dialog instance |
| **dialog data** | `ctx.dialogData.x = …` or `ctx.dialog.update({ … })` | `ctx.dialogData` | the dialog instance |
| **widget data** | widget interaction, or `ctx.widgetData(id, fallback)` | typed accessors (below) | the dialog instance |
| **getter output** | a `getter` function | the `data` arg in `text`/`keyboard` | recomputed every render |

Inside a render, `data` is `dialog.getter` ⊕ `window.getter` output, plus
`data.dialogData` and `data.startData` for convenience.

## Navigation — `ctx.dialog` (and flat `ctx.*`)

Every method on the manager is also mirrored flat on the context, so
`ctx.switchTo("settings")` ≡ `ctx.dialog.switchTo("settings")`.

```ts
ctx.dialog                                   // the DialogManager itself
ctx.start(dialog, state?, { data?, mode?, startMode? })  // open a dialog (push)
ctx.switchTo(state, mode?)   // jump to a sibling window — records back-history
ctx.back(mode?)              // history: undo the last switchTo / next
ctx.next(mode?)              // next window in declaration order (linear wizards)
ctx.done(result?, mode?)     // close this dialog, hand result to the opener
ctx.show(mode?)              // re-render current window, no state change
ctx.widgetData(id, fallback) // read/seed a widget's stored value
ctx.dialogData               // mutable per-dialog bag (getter/setter)
ctx.params                   // immutable start params

// only on ctx.dialog (not mirrored flat):
ctx.dialog.update(partial, mode?)        // merge into dialogData + re-render
ctx.dialog.counter(id)                   // { get, set }
ctx.dialog.checkbox(id)                  // { checked, set, toggle }
ctx.dialog.radio(id)                     // { selected, set }
ctx.dialog.multiselect(id)               // { selected, isSelected, set, toggle }
ctx.dialog.history                       // string[] of visited states
```

- **`back` is history-based** (where you came from), **`next` is order-based**
  (the next `.window(...)` declared). `next` also records history, so a paired
  `Back()` undoes it.
- **`ShowMode`** controls delivery: `Auto` (edit on callback, send on message) ·
  `Send` · `Edit` · `Delete` (delete + resend — needed for media↔text switches).
- A no-op edit (clicking a button that re-renders the same screen) is swallowed —
  Telegram's `message is not modified` is expected, not an error.

## Stack navigation & nested dialogs

Dialogs form a **stack** per (chat, user). `start` pushes, `done` pops and returns
a result to the dialog underneath.

```ts
const parent = new Dialog("parent", {
  // receives the child's result when it closes:
  onProcessResult: (ctx, childStartData, result) => ctx.dialog.update({ picked: result }),
}).window("main", {
  text: (d) => `Picked: ${d.dialogData.picked ?? "—"}`,
  keyboard: Column([Start("Pick a date", "datepicker")]), // push child dialog
});

const datepicker = new Dialog("datepicker").window("pick", {
  text: "Pick one",
  keyboard: Column([Button("Today", { id: "t", onClick: (ctx) => ctx.done("2026-06-19") })]),
});
```

`StartMode` controls how `start` treats the existing stack:

| Mode | Effect |
|---|---|
| `StartMode.Normal` (default) | push on top of the current stack |
| `StartMode.ResetStack` | clear the current stack first — the new dialog stands alone |
| `StartMode.NewStack` | open an **independent parallel stack**; the old one stays alive |

Closing the **last** dialog on a stack deletes its message (and dismisses any
reply keyboard). Parallel stacks route by intent id, so two independent flows can
live in one chat at once. (Stack depth is capped at 100 as an abuse guard.)

## Typed dialogs — `defineDialog`

For **typed states** and **typed `dialogData` / `params`**, use the builder. State
typos become compile errors (including forward references), and getter/handler
contexts are fully typed.

```ts
import { defineDialog, Column } from "@gramio/dialogs";

const wb = defineDialog("wizard")
  .states("name", "confirm")     // the state union — switchTo only accepts these
  .params<{ chatId: number }>()  // ctx.params type
  .data<{ score: number }>();    // ctx.dialogData type

wb.window("name", {
  getter: (ctx) => ({ hi: ctx.from?.firstName ?? "?" }), // ctx.params: { chatId }
  text: (d) => `Hi ${d.hi}`,
  keyboard: Column([wb.switchTo("Next ▶", "confirm")]),   // "confirm" ✓, "typo" ✗
});
wb.window("confirm", { text: "Done", keyboard: Column([wb.cancel("Close")]) });

const wizard = wb.build(); // → a Dialog; register via dialogs([wizard])
```

The builder exposes typed `switchTo` / `next` / `back` / `cancel` / `start` /
`button` helpers, plus `wb.nav(ctx)` to narrow a raw handler context to the
dialog's states. Passing a built `TypedDialog` to `Start(...)` / `ctx.start(...)`
type-checks the target's `state` and `data`. See [`examples/typed.ts`](examples/typed.ts).

## Input, media & reply keyboards

```ts
// free-text input — `input` is consulted before `onMessage`
new Dialog("ask").window("name", {
  text: "What's your name?",
  input: TextInput({ id: "name", onSuccess: (ctx, value) => ctx.done(value) }),
});

// media — text↔media transitions are handled automatically (delete + resend)
.window("photo", { media: StaticMedia(fileId, "photo"), text: "caption" })

// reply keyboard — callbacks smuggled in invisible chars, so widgets still work
.window("menu", { reply: true, keyboard: Column([Button("Tap", { id: "x", onClick })]) })
```

Reply-keyboard windows always send a fresh message (reply keyboards can't be edited
in place), and `RequestUser` / `RequestChat` / `ContactRequest` / `LocationButton`
only render inside `reply: true` windows.

## Background updates (edit from outside a handler)

`createDialogs` returns the plugin **plus** a `background` factory — render into a
user's dialog message from a timer, webhook, or queue worker.

```ts
const { plugin, background } = createDialogs([menu]);
bot.extend(plugin);

// later, with no incoming update:
const mgr = await background(bot, `grd:${userId}`); // stack key
await mgr.update({ price: 42 });                    // edits the last rendered message
```

It defaults to **editing** the last message and throws if the stack has never been
rendered (there's no message to edit).

## Plugin registration & options

```ts
bot.extend(dialogs([menu, wizard], {
  storage: redisStorage(),                 // default: in-memory (dev only)
  getStackKey: (ctx) => `grd:${ctx.chatId}:${ctx.senderId}`, // default: grd:<senderId>
  i18n: (ctx) => ctx.t,                    // translator for the T() widget
  callback: { name: "myprefix" },          // rename the "grd" callback_data scheme
  events: {                                // overridable engine answers (silent by default)
    onStale: (ctx) => ctx.answer("This menu has expired"),
    onAccessDenied: (ctx) => ctx.answer("Not for you"),
  },
}));
```

| Option | Type | Default | Description |
|---|---|---|---|
| `storage` | `@gramio/storage` adapter | in-memory | where dialog stacks are persisted |
| `getStackKey` | `(ctx) => string` | `grd:<senderId>` | partitions stacks (per-chat, per-thread, …) |
| `i18n` | `(ctx) => Translator` | `ctx.t` if present, else echo | resolves the `T(key)` text widget |
| `callback` | `{ name }` or `{ pack, unpack }` | built-in `"grd"` codec | customise `callback_data` encoding |
| `events` | `{ onStale?, onAccessDenied? }` | silent answer | global hooks for engine-generated answers |

`dialogs(list, opts)` is sugar over `createDialogs(list, opts).plugin`.

## Widgets

Every text slot accepts a **bare string**, a **`(data) => …`** function, or a text
widget — no `Const` / `Format` wrapper needed. Buttons have **positional**
overloads and an options form:

```ts
SwitchTo("⚙️ Settings", "settings");                                  // positional
SwitchTo({ text: "⚙️ Settings", state: "settings", icon, style });    // options
SwitchTo("Settings", "settings", { icon: "5283103725936750105", style: "primary" }); // custom emoji
```

| Group | Widgets |
|---|---|
| **Text** | `Const`, `Format`, `Multi`, `Case`, `List`, `Progress`, `T` (i18n) · helper `asText` |
| **Actions** | `Button`, `SwitchTo`, `Back`, `Next`, `Cancel`, `Start`, `Url`, `WebApp`, `SwitchInlineQuery` |
| **Layout** | `Group(children, { width })`, `Row`, `Column` |
| **Stateful** | `Counter`, `Select`, `Multiselect`, `Radio`, `Checkbox`, `Toggle` · helpers `getSelected`, `getToggle`, `isChecked` |
| **Forms** | `Rating`, `Slider`, `Confirm`, `Stepper`, `PinPad`, `TagInput`, `Form` (Standard Schema) · helpers `getRating`, `getSlider`, `getPin`, `getTags`, `addTag`, `getFormValues` |
| **Data** | `Tabs`, `Accordion`, `Breadcrumbs`, `Grid`, `AsyncSelect` · helper `getTab` |
| **Complex** | `Calendar` (+ `marks`), `ScrollingGroup` + `First/Prev/Next/LastPage`/`CurrentPage` (+ `pageState`), `ListGroup` (+ `listItemId`) |
| **Native** | `Poll`, `Reactions`, `RequestUser`, `RequestChat`, `ContactRequest`, `LocationButton` · helpers `getReactions`, `getSharedUsers`, `getSharedChat` |
| **Live** | `Spinner`, `Countdown`, `LiveProgress`, `typing` / `withTyping` |
| **Money / AI** | `StarsButton` (Telegram Stars), `stream` (`sendMessageDraft`) |
| **Charts / codes** | `Sparkline`, `BarChart`, `Gauge`, `QR`, `Barcode` |
| **Input / Media** | `TextInput` (+ `getInput`), `StaticMedia`, `DynamicMedia`, `MediaScroll` (+ `mediaScrollPage`) |

> **`callback_data` budget:** Telegram caps inline `callback_data` at 64 bytes and
> rejects the whole keyboard if you exceed it. Use **short item ids** (list indices),
> never long strings, as widget payloads — the engine warns once per widget in dev
> if you overflow.

Each widget is shown in use in the [examples](examples).

## API surface

The low-level building blocks behind the sugar are all exported, if you need them:

- **Engine:** `dialogs` / `createDialogs`, `DialogManager`, `DialogRegistry`,
  `StackRepository`, `makeCodec`.
- **Building blocks:** `Dialog` (also `new Dialog({ id, windows: [new Window(...)] })`),
  `Window`, `defineWindow`, `defineDialog` / `DialogBuilder`.
- **Enums:** `StartMode` (`Normal` / `ResetStack` / `NewStack`),
  `ShowMode` (`Auto` / `Send` / `Edit` / `Delete`).
- **Types:** `RenderContext<Data>`, `Getter`, `ClickCtx` / `InputCtx`,
  `TextSource` / `TextWidget`, `Keyboard`, `MediaWidget`, `DialogEvents`,
  `AccessCheck`, plus the `Typed*` family — see [`src/index.ts`](src/index.ts).

**Storage shape** (what lands in your `@gramio/storage` adapter): a `StackStore`
of `{ stacks: DialogStack[]; currentId }`, where each `DialogStack` holds the
`intents` (dialog instances with `stateKey`, `data`, `widgetData`, `history`) and
the last `chatId` / `messageId`. With a single stack it collapses to a plain
`DialogStack` for back-compat.

## Examples

Each file in [`examples/`](examples) is a self-contained, runnable bot (see
[`examples/README.md`](examples/README.md)):

| File | Showcases |
|---|---|
| [`basic.ts`](examples/basic.ts) | minimal two-screen dialog |
| [`api-styles.ts`](examples/api-styles.ts) | the same dialog 5 ways + typed cross-dialog transitions |
| [`widgets.ts`](examples/widgets.ts) | widget gallery — text, stateful, forms + `Form`, data/selection, calendar, pagination, input |
| [`charts.ts`](examples/charts.ts) | visuals — `Sparkline`/`BarChart`/`Gauge` + media (`QR`/`Barcode`/`StaticMedia`/`DynamicMedia`/`MediaScroll`) |
| [`realtime.ts`](examples/realtime.ts) | live widgets, native `Poll`/`Reactions`/pickers, Stars + AI streaming |
| [`typed.ts`](examples/typed.ts) | `defineDialog` typed states + `nav`, access, i18n, `MediaScroll`, calendar marks |
| [`typed-and-nested.ts`](examples/typed-and-nested.ts) | `Dialog<Params>` + nested dialog results |
| [`views-and-dialogs.ts`](examples/views-and-dialogs.ts) | coexistence with [`@gramio/views`](https://github.com/gramiojs/views) |
| [`scenes-and-dialogs.ts`](examples/scenes-and-dialogs.ts) | incremental adoption with [`@gramio/scenes`](https://gramio.dev/plugins/official/scenes) |
| [`assistant/`](examples/assistant) | 🤖 real-app composition — `node:sqlite` webhook inbox, calendar, AI summary, Stars, live push |

## Development

```bash
bun install
bun run typecheck      # tsc -p tsconfig.build.json (src) — publish gate
bun run typecheck:all  # tsc over src + tests + examples
bun test               # bun:test — fake-bot unit harness + real-bot integration (@gramio/test)
bun run lint           # biome
bun run build          # pkgroll → dist (esm + cjs + d.ts)
```

## License

MIT
