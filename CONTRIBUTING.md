# Contributing to @gramio/dialogs

Thanks for your interest! This is a TypeScript library for
[GramIO](https://gramio.dev) — declarative dialogs and reusable widgets.

## Setup

```bash
bun install
```

The repo uses [Bun](https://bun.sh) for tests and scripts; the published package
runs on Node ≥ 20, Bun, and Deno.

## The gate (must be green before a PR)

```bash
bun run check   # lint + typecheck + typecheck:all + test + build
```

Individually:

| Command | What it does |
|---|---|
| `bun run lint` | Biome (tabs, double quotes) — `lint:fix` to auto-fix |
| `bun run typecheck` | `tsc` over `src` only (the publish gate) |
| `bun run typecheck:all` | `tsc` over `src` + `tests` + `examples` (validates `@ts-expect-error`) |
| `bun test` | the `bun:test` suites (offline fake-bot harness) |
| `bun run build` | `pkgroll` → `dist` (ESM + CJS + `.d.ts`) |

## Conventions

- **Formatting/linting:** Biome — tabs, double quotes. Run `bun run lint:fix`.
- **Types:** strict, no `any`. The render layer is generic over `Data`
  (`Window<Data>`, `RenderContext<Data>`, …); derive types or use `unknown` +
  narrow.
- **Tests:** add a test for every new widget/behaviour, using the fake-bot
  harness in `tests/helpers.ts`. Lock in type-level guarantees with
  `@ts-expect-error` (validated by `typecheck:all`).
- **Telegram limits:** inline `callback_data` ≤ 64 bytes — use short item ids
  (list indices), never long strings, as widget payloads.
- **Commits/PRs:** keep changes focused; update the `README.md` API section and
  add/adjust an `examples/` file when you change public API.

## Project layout

- `src/` — the only shippable code (`manager.ts` is the engine; `widgets/` holds
  the widgets; `typed.ts`/`builder.ts` the typed builders).
- `tests/` — `bun:test` suites.
- `examples/` — small runnable examples.
