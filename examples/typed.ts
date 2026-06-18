import { inMemoryStorage } from "@gramio/storage";
import { Bot } from "gramio";
import {
	Button,
	Calendar,
	Column,
	Dialog,
	MediaScroll,
	type RenderedMedia,
	T,
	defineDialog,
	dialogs,
} from "../src/index.ts";

/**
 * typed states (`defineDialog`), access control, i18n (`T`),
 * `MediaScroll` carousel, and `Calendar` marks.
 */

// ─── Typed dialog: `switchTo` / `.window` only accept declared states ───
const wb = defineDialog("wizard")
	.states("intro", "date")
	.params<{ chatId: number }>()
	.data<{ picked?: string }>();

const photos: RenderedMedia[] = [
	{ type: "photo", media: "https://picsum.photos/seed/a/600" },
	{ type: "photo", media: "https://picsum.photos/seed/b/600" },
	{ type: "photo", media: "https://picsum.photos/seed/c/600" },
];
const gallery = MediaScroll({ id: "gallery", items: photos });

wb.window("intro", {
	getter: (ctx) => ({ chat: ctx.params.chatId }),
	// i18n: resolves via `dialogs(list, { i18n })`, else echoes the key.
	text: T("wizard.intro", (d) => ({ chat: d.chat })),
	media: gallery,
	keyboard: Column([gallery, wb.switchTo("📅 Pick a date ▶", "date")]),
});

wb.window("date", {
	text: "Pick a day:",
	keyboard: Column([
		Calendar({
			id: "cal",
			// Highlight the user's picked day. `marks` receives the RenderContext, so it
			// reads per-user state from `dialogData` (persisted via storage, see below).
			// NOTE: compare by value (ISO string) — `Date` objects are never `==` equal.
			marks: (date, rc) => {
				const picked = (rc.data.dialogData as { picked?: string }).picked;
				return date.toISOString().slice(0, 10) === picked
					? `⭐${date.getUTCDate()}`
					: undefined;
			},
			onSelect: (ctx, date) => {
				// dialogData is per-user, mutable, and persisted by the storage adapter.
				// Writing it triggers an automatic re-render → the ⭐ appears immediately.
				ctx.dialogData.picked = date.toISOString().slice(0, 10);
				return ctx.answer(`Picked ${ctx.dialogData.picked}`);
			},
		}),
		// Raw Button (not wb.button) → wrap ctx in wb.nav() for a typed switchTo:
		// "intro" ✓ compiles, a typo would be a compile error (not a runtime throw).
		Button("◀ Back", {
			id: "back",
			onClick: (ctx) => wb.nav(ctx).switchTo("intro"),
		}),
	]),
});

const wizard = wb.build();

// ─── Access-controlled admin dialog ───
const ADMIN_ID = 1;
const admin = new Dialog("admin", {
	// Runs on every interaction; only the admin gets past it.
	access: (ctx) => ctx.from?.id === ADMIN_ID,
	onAccessDenied: (ctx) => ctx.dialog.clickCtx.answer("Admins only"),
}).window("panel", {
	text: "🔒 Admin panel",
	keyboard: Column([
		Button("Reload", {
			id: "reload",
			onClick: (ctx) => ctx.answer("reloaded"),
		}),
	]),
});

new Bot(process.env.BOT_TOKEN as string)
	.extend(
		dialogs([wizard, admin], {
			// Per-user dialog state (the stack + dialogData + widget state) is persisted
			// here, keyed per user. inMemoryStorage is dev-only (lost on restart) — for
			// production swap in a persistent adapter, e.g.:
			//   import { redisStorage } from "@gramio/storage-redis"; // peer: ioredis
			//   storage: redisStorage(new Redis(process.env.REDIS_URL!)),
			storage: inMemoryStorage(),
			// Storage key per user (default `agd:<senderId>`). Scope per chat+user so
			// the same person gets independent dialogs across chats / groups:
			getStackKey: (ctx) => `agd:${ctx.chatId}:${ctx.senderId}`,
			// plug in @gramio/i18n by passing its `ctx.t`; here, a tiny inline stub.
			i18n: () => (key, params) =>
				key === "wizard.intro" ? `Welcome (chat ${params?.chat})` : key,
		}),
	)
	.command("start", (ctx) =>
		ctx.dialog.start("wizard", undefined, {
			data: { chatId: ctx.chatId ?? 0 },
		}),
	)
	.command("admin", (ctx) => ctx.dialog.start("admin"))
	.start();
