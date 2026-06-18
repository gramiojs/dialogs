# @gramio/dialogs

[![npm](https://img.shields.io/npm/v/@gramio/dialogs?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.com/package/@gramio/dialogs)
[![npm downloads](https://img.shields.io/npm/dw/@gramio/dialogs?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.com/package/@gramio/dialogs)
[![CI](https://github.com/gramiojs/dialogs/actions/workflows/ci.yml/badge.svg)](https://github.com/gramiojs/dialogs/actions/workflows/ci.yml)

Declarative, stateful **dialogs** and reusable **widgets** for
[GramIO](https://gramio.dev) — build interactive, multi-screen Telegram bot UIs
with automatic message management and stack-based navigation.

Inspired by [aiogram_dialog](https://github.com/Tishka17/aiogram_dialog),
reimagined for TypeScript.

You describe bots as **windows**: what to show (`text` / `keyboard` / `media`),
where data comes from (`getter`), and what to do on a tap (`onClick`). After any
action the screen **re-renders itself** — no manual `editMessageText`, no
`callback_data` plumbing, no FSM boilerplate.

```ts
import { Bot } from "gramio";
import { Dialog, dialogs, Group, Column, SwitchTo, Back, Button, Counter } from "@gramio/dialogs";

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

## Features

- 🧩 **Declarative windows** — screens as widget trees; auto re-render after actions.
- 🧠 **Stateful widgets** — `Counter`, `Select`, `Multiselect`, `Radio`, `Checkbox`, `Toggle`.
- 📅 **Complex widgets** — `Calendar` (drill-down + min/max + `marks`), `ScrollingGroup` (pagination), `ListGroup` (per-item state).
- 🗂 **Stack navigation** — nested dialogs (push/pop, results) + parallel independent stacks (`StartMode.NewStack`).
- 💬 **Input** — `TextInput` with validation, `onMessage`.
- 🖼 **Media** — photo/video with automatic text↔media transitions, plus `MediaScroll` carousel.
- ⌨️ **Reply keyboards** — callbacks smuggled in invisible characters.
- 🔄 **Background updates** — edit a dialog's message from outside a handler.
- 🎨 **Custom emoji on buttons** via `icon_custom_emoji_id`.
- 🌍 **i18n** — `T(key, params?)` text widget, pluggable translator (`@gramio/i18n`).
- 🔒 **Access control** — guard who may interact with a dialog (`access` / `onAccessDenied`).
- ✨ **Scenes-level typing** — getter data flows into widgets; `defineWindow<Data>()`, `Dialog<Params>`, and the `defineDialog` builder for **typed states & dialog data**.
- 🧪 Tested (`bun test`) — unit (fake-bot harness) **and** real-bot integration
  via [`@gramio/test`](https://gramio.dev/testing); strict TypeScript, ESM + CJS +
  d.ts build (`pkgroll`).

## Install

```bash
npm install @gramio/dialogs
# yarn add @gramio/dialogs
# pnpm add @gramio/dialogs
# bun add @gramio/dialogs
```

`gramio` is a peer dependency.

**Compatibility:** `gramio` ≥ 0.11 · Node ≥ 20, Bun, and Deno · ships ESM + CJS
+ `.d.ts`. Persistence works with any [`@gramio/storage`](https://gramio.dev)
adapter (in-memory, Redis, Cloudflare KV, …).

## Concise API

Every text slot accepts a **bare string**, a **`(data) => …`** function, or a
text widget — no `Const`/`Format` wrapper needed. Buttons have **positional**
overloads and an options form:

```ts
SwitchTo("⚙️ Settings", "settings");                 // positional
SwitchTo({ text: "⚙️ Settings", state: "settings", icon, style });  // options

// in handlers — flat navigation surface:
onClick: (ctx) => { ctx.dialogData.count++; return ctx.switchTo("next"); }
```

## Typed (scenes-level)

`getter` output flows into the window's widgets; `Dialog<Params>` types `ctx.params`:

```ts
const confirm = new Dialog<{ question: string }>("confirm").window("ask", {
  getter: (ctx) => ({ question: ctx.params.question }), // ctx.params: { question: string }
  text: (d) => d.question,                              // d fully typed
  keyboard: Column([Button("Yes", { id: "y", onClick: (ctx) => ctx.done(true) })]),
});
```

## Custom emoji on buttons

```ts
SwitchTo("Settings", "settings", { icon: "5283103725936750105", style: "primary" });
```

`icon` sets `icon_custom_emoji_id` (needs an eligible bot). See the external
playground for a script that builds a custom-emoji set from `@tabler/icons`.

---

# API

## `dialogs(list, options?)` / `createDialogs(list, options?)`

The engine plugin. `dialogs([...])` is sugar; `createDialogs([...])` also returns
a `background` factory for editing a dialog's message outside a handler.
`options`: `storage?` ([@gramio/storage](https://gramio.dev)), `getStackKey?`,
`i18n?` (translator resolver for the `T` widget, e.g. `(ctx) => ctx.t`),
`callback?` (custom `callback_data` codec, e.g. `{ name: "myprefix" }` or a full
`pack`/`unpack` pair), `events?` (`onStale` / `onAccessDenied` engine hooks).

## `Dialog`

```ts
new Dialog<Params>("id", { getter?, onStart?, onClose?, onProcessResult?, access?, onAccessDenied? })
  .window("state", { getter?, text?, keyboard?, media?, input?, onMessage?, reply?, disableWebPreview? });

// or: new Dialog({ id, windows: [ new Window({ state, ... }) ], ... })
```

`access: (ctx) => boolean` guards who may interact with the dialog; rejected
callbacks are answered (or routed to `onAccessDenied`) and rejected messages fall
through. For **typed states & dialog data**, use the `defineDialog` builder
(see [`examples/typed.ts`](examples/typed.ts)).

## `ctx.dialog` / flat `ctx.*`

`start` · `switchTo` · `back` (history) · `next` · `done` · `update` · `show` ·
`dialogData` · `params` · `widgetData(id, default)` ·
`counter/checkbox/radio/multiselect(id)` (typed state accessors).
`StartMode`: `Normal | ResetStack | NewStack`. `ShowMode`: `Auto | Send | Edit | Delete`.

## Widgets

| Group | Widgets |
|---|---|
| **Text** | `Const`, `Format`, `Multi`, `Case`, `List`, `Progress`, `T` (i18n) |
| **Actions** | `Button`, `SwitchTo`, `Back`, `Next`, `Cancel`, `Start`, `Url`, `WebApp`, `SwitchInlineQuery` |
| **Layout** | `Group(children, { width })`, `Row`, `Column` |
| **Stateful** | `Counter`, `Select`, `Multiselect`, `Radio`, `Checkbox`, `Toggle` |
| **Forms** | `Rating`, `Slider`, `Confirm`, `Stepper`, `PinPad`, `TagInput`, `Form` (Standard Schema) |
| **Data** | `Tabs`, `Accordion`, `Breadcrumbs`, `Grid`, `AsyncSelect` |
| **Complex** | `Calendar` (+ `marks`), `ScrollingGroup` + `First/Prev/Next/LastPage`/`CurrentPage`, `ListGroup` |
| **Native** | `Poll`, `Reactions`, `RequestUser`, `RequestChat`, `ContactRequest`, `LocationButton` |
| **Live** | `Spinner`, `Countdown`, `LiveProgress`, `typing` |
| **Money / AI** | `StarsButton` (Telegram Stars), `stream` (`sendMessageDraft`) |
| **Charts / codes** | `Sparkline`, `BarChart`, `Gauge`, `QR`, `Barcode` (via etiket) |
| **Input / Media** | `TextInput`, `StaticMedia`, `DynamicMedia`, `MediaScroll` |

Each widget is shown in use in the [examples](examples).

## Examples

Each file in [`examples/`](examples) is a self-contained, runnable bot (see
[`examples/README.md`](examples/README.md)):

| File | Showcases |
|---|---|
| [`basic.ts`](examples/basic.ts) | minimal two-screen dialog |
| [`api-styles.ts`](examples/api-styles.ts) | the same dialog 5 ways + typed cross-dialog transitions |
| [`widgets.ts`](examples/widgets.ts) | widget gallery — text, stateful (+ `getSelected`/`getToggle`), forms + `Form`, data/selection, calendar, pagination, input |
| [`charts.ts`](examples/charts.ts) | visuals — `Sparkline`/`BarChart`/`Gauge` + media (`QR`/`Barcode`/`StaticMedia`/`DynamicMedia`/`MediaScroll`) |
| [`realtime.ts`](examples/realtime.ts) | live widgets (`Spinner`/`Countdown`/`LiveProgress`), native `Poll`/`Reactions`/pickers, Stars + AI streaming |
| [`typed.ts`](examples/typed.ts) | `defineDialog` typed states + `nav`, access, i18n, `MediaScroll`, calendar marks |
| [`typed-and-nested.ts`](examples/typed-and-nested.ts) | `Dialog<Params>` + nested dialog results |
| [`views-and-dialogs.ts`](examples/views-and-dialogs.ts) | coexistence with [`@gramio/views`](https://github.com/gramiojs/views) |
| [`scenes-and-dialogs.ts`](examples/scenes-and-dialogs.ts) | incremental adoption with [`@gramio/scenes`](https://gramio.dev/plugins/official/scenes) |
| [`assistant/`](examples/assistant) | 🤖 real-app composition — `node:sqlite` webhook inbox, calendar, AI summary, Stars, live push |

## Development

```bash
bun install
bun run typecheck   # tsc -p tsconfig.build.json (src) — publish gate
bun run typecheck:all  # tsc over src + tests + examples
bun test            # bun:test — fake-bot unit harness + real-bot integration (@gramio/test)
bun run lint        # biome
bun run build       # pkgroll → dist (esm + cjs + d.ts)
```

See [`examples/`](examples) for runnable bots covering every widget.

## License

MIT
