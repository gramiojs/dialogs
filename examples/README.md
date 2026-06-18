# Examples

Each file is a self-contained, runnable bot. Set a token and run one:

```bash
export BOT_TOKEN="123:abc"
bun run examples/widgets.ts        # or: examples/<name>.ts
```

All examples import from `../src` so they run straight against the source.

| File | Showcases |
|---|---|
| `basic.ts` | minimal two-screen dialog — the concise builder API |
| `api-styles.ts` | the **same dialog five ways** (chained / array / typed builder / `defineWindow` / `Form`) + **typed cross-dialog transitions** (`Start(text, dialogObject, { state })`) |
| `widgets.ts` | the **widget gallery** (cheat-sheet): text (`Multi`/`Case`/`Progress`/`List`), stateful (`Counter`/`Checkbox`/`Toggle`/`Radio`/`Multiselect` + `getSelected`/`getToggle`/`isChecked`), form widgets + a validated multi-step `Form` (Standard Schema, + `getPin`), data/selection (`Tabs`/`Accordion`/`Breadcrumbs`/`Grid`/`AsyncSelect`), `Calendar` marks, paginated list (standalone pagers), validated `TextInput` (+ `getInput`) |
| `charts.ts` | **visuals** — `Sparkline`/`BarChart`/`Gauge` plus every media widget (`QR`/`Barcode`/`StaticMedia`/`DynamicMedia`/`MediaScroll`) |
| `realtime.ts` | **live + native + payments** in one bot — `Spinner`/`Countdown`/`LiveProgress` animated via the background manager + `typing`; native `Poll`/quiz, `Reactions`, reply-keyboard pickers (`RequestUser`/`RequestChat`/`ContactRequest`/`LocationButton`); `StarsButton` (Telegram Stars) + `stream` (AI token streaming); plus `WebApp`/`SwitchInlineQuery`/`Cancel` and a custom `callback` codec prefix |
| `typed.ts` | `defineDialog` **typed states** + `wb.nav(ctx)`, access control, i18n (`T`), `MediaScroll`, `Calendar` marks, storage wiring |
| `typed-and-nested.ts` | `Dialog<Params>` + nested dialogs returning results |
| `views-and-dialogs.ts` | **coexistence with [@gramio/views](https://github.com/gramiojs/views)** — a `/menu` view button opens a dialog; the dialog's `onClose` edits straight back to the menu view |
| `scenes-and-dialogs.ts` | **incremental adoption with [@gramio/scenes](https://gramio.dev/plugins/official/scenes)** — a scene collects input then hands off (one-way) to a stateful dialog that finishes with a receipt (`onClose`). Shows the two interop rules (extend `dialogs()` **before** `scenes()`; result flows back via `onClose`) and the `"grd"` callback namespacing |
| `assistant/` | 🤖 **real-app COMPOSITION** — a "personal assistant" webhook inbox backed by `node:sqlite`: paginated inbox (`AsyncSelect`+`Tabs`), notification detail (`DynamicMedia`/`Reactions`/`Rating`/`Confirm`), `Calendar` with DB event marks + a `ListGroup` day view, an AI summary streamed over real unread rows, Stars, and a QR pairing screen — plus a live `node:http` webhook server that pushes notifications via the background manager. (Per-widget "what does this do" demos live in the focused files above; this one shows how they wire together in a real app.) |

> Tip: the typed builder (`typed.ts`) gives compile-time-checked navigation —
> `wb.switchTo` / `wb.nav(ctx).switchTo` reject unknown states at build time.
