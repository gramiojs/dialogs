# CLAUDE.md

Guidance for AI agents working in this repository.

## What this is

`@gramio/dialogs` — a declarative dialog/widget framework for [GramIO](https://gramio.dev),
inspired by aiogram_dialog. Screens are described as widget trees; the engine
handles message send/edit/delete, callback routing, and stack navigation.

## Layout

- `src/` — library source (the only shippable code).
  - `manager.ts` — `DialogManager` (the engine: navigation, render, callback routing).
  - `dialog.ts` / `window.ts` — `Dialog` (state group) and `Window` (one screen).
  - `widgets/` — text, buttons, layout, stateful, complex, input, media widgets.
  - `context.ts` — stack/store persistence; `plugin.ts` — the GramIO plugin.
  - `index.ts` — public exports.
- `tests/` — `bun:test` suites driving a fake-bot harness (`tests/helpers.ts`).
- `examples/` — small focused, runnable examples.
- `docs/` — documentation source (see `docs/README.md`).

## Conventions (match these)

- **Formatter/linter:** Biome (`bun run lint` / `lint:fix`). Tabs, double quotes.
- **Tests:** `bun test`. Add a test for every new widget/behaviour; keep the
  fake-bot harness pattern in `tests/helpers.ts`.
- **Types:** strict. The render layer is generic over `Data` (`Window<Data>`,
  `RenderContext<Data>`, …). No `any` — derive types or use `unknown` + narrow.
- **Build:** `pkgroll` (`bun run build`) → `dist` (esm + cjs + d.ts).
- **Type gate:** `bun run typecheck` (= `tsc -p tsconfig.build.json`, src only —
  `bun:test` ambient types don't resolve under plain `tsc`).
- **Telegram limits:** inline `callback_data` ≤ 64 bytes — use short item ids
  (list indices), never long strings, as widget payloads.

## Before finishing

Run `bun run typecheck && bun test && bun run build` — all must be green.

The interactive demo bots live OUTSIDE this repo (moved to keep the package
clean). See README "Examples".
