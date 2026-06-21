import { describe, expect, it } from "bun:test";
import { inMemoryStorage } from "@gramio/storage";
import { DIALOG_CB } from "../src/callback.ts";
import { type DialogStack, StackRepository } from "../src/context.ts";
import { Dialog } from "../src/dialog.ts";
import { createDialogs } from "../src/plugin.ts";
import { ShowMode, StartMode } from "../src/types.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

// ── D2-2: keyed async mutex + reload-under-lock ──────────────────────
describe("StackRepository.withLock (D2-2)", () => {
	it("serializes critical sections on the same key (no interleave)", async () => {
		const repo = new StackRepository(inMemoryStorage());
		const log: string[] = [];
		const section = (tag: string) =>
			repo.withLock("k", async () => {
				log.push(`${tag}:start`);
				await Promise.resolve();
				await Promise.resolve();
				log.push(`${tag}:end`);
			});
		await Promise.all([section("a"), section("b")]);
		// a runs fully before b — never start,start,end,end
		expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
	});

	it("lets different keys run concurrently", async () => {
		const repo = new StackRepository(inMemoryStorage());
		const log: string[] = [];
		const section = (key: string, tag: string) =>
			repo.withLock(key, async () => {
				log.push(`${tag}:start`);
				await Promise.resolve();
				log.push(`${tag}:end`);
			});
		await Promise.all([section("k1", "a"), section("k2", "b")]);
		// both started before either ended → concurrent
		expect(log.slice(0, 2).sort()).toEqual(["a:start", "b:start"]);
	});

	it("_reloadStore picks up a concurrently-persisted change", async () => {
		const dlg = new Dialog({
			id: "d",
			windows: [new Window({ state: "a", text: Const("a") })],
		});
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.start("d", "a");

		// A concurrent writer persists a fresh stack object (distinct ref, as real
		// serialized storage returns) under the same key, behind the manager's back.
		const cur = await h.repo.load(h.key);
		const replaced = {
			...cur,
			intents: cur.intents.map((it, i) =>
				i === cur.intents.length - 1
					? { ...it, data: { ...it.data, injected: "X" } }
					: it,
			),
		};
		await h.repo.save(h.key, replaced);

		expect((m.data as { injected?: string }).injected).toBeUndefined(); // stale
		await m._reloadStore();
		expect((m.data as { injected?: string }).injected).toBe("X"); // fresh
	});
});

// ── D2-3: currentId reselection persisted on the denied path ─────────
describe("routePacked reselection persistence (D2-3)", () => {
	it("persists the currentId flip even when the tap is denied", async () => {
		const dlg = new Dialog({
			id: "d",
			access: () => false, // every tap is denied
			windows: [
				new Window({
					state: "a",
					text: Const("a"),
					keyboard: Column([Button("x", { id: "x" })]),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();

		// two parallel stacks; current = the second
		await (await h.managerFor(h.makeCtx("message"))).start("d", "a");
		await (await h.managerFor(h.makeCtx("message"))).start("d", "a", {
			startMode: StartMode.NewStack,
		});

		const before = await h.repo.loadStore(h.key);
		const other = before.stacks.find((s) => s.id !== before.currentId);
		if (!other) throw new Error("expected a second stack");
		const otherIntent = other.intents.at(-1)?.intentId as string;

		// tap the NON-current stack's intent → owner flip → denied
		const data = DIALOG_CB.pack({ i: otherIntent, w: "x" });
		await (
			await h.managerFor(h.makeCtx("callback_query", data))
		)._handleCallback();

		const after = await h.repo.loadStore(h.key);
		expect(after.currentId).toBe(other.id); // reselection survived the denied return
	});
});

// ── D2-4: reply-keyboard answer shim is scoped, not leaked ───────────
describe("reply-keyboard answer shim (D2-4)", () => {
	it("restores ctx.answer after routing instead of leaving a no-op stub", async () => {
		const dlg = new Dialog({
			id: "rk",
			windows: [
				new Window({
					state: "a",
					reply: true,
					text: Const("m"),
					keyboard: Column([
						Button("Tap", { id: "x", onClick: (c) => c.answer() }),
					]),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("rk", "a");

		const label = h.last().buttons[0]?.[0]?.text as string; // encoded reply label
		const ctx = h.makeCtx("message", undefined, label) as { answer?: unknown };
		ctx.answer = undefined; // a real message ctx has no answer

		const m = await h.managerFor(ctx as never);
		expect(await m._handleMessage()).toBe(true);
		expect(ctx.answer).toBeUndefined(); // stub removed, shared ctx not polluted
	});
});

// ── D2-1: background() ctx overrides reach getters ───────────────────
describe("background ctx overrides (D2-1)", () => {
	function seed(stateKey: string): DialogStack {
		return {
			id: "default",
			intents: [
				{
					intentId: "bg1",
					stackId: "default",
					groupId: "bg",
					stateKey,
					startData: undefined,
					data: {},
					widgetData: {},
					history: [],
				},
			],
			lastMessageId: 777,
			lastChatId: 1,
			hasMedia: false,
		};
	}

	it("passes overridden `from` fields into a background getter", async () => {
		const dlg = new Dialog({
			id: "bg",
			windows: [
				new Window({ state: "a", text: Const("a") }),
				new Window({
					state: "b",
					getter: (ctx) => ({
						u: (ctx.from as { username?: string })?.username ?? "none",
					}),
					text: (d) => `u:${d.u}`,
				}),
			],
		});
		const storage = inMemoryStorage();
		const engine = createDialogs([dlg], { storage });
		await storage.set("k", seed("a"));

		let edited: { text?: unknown } | undefined;
		const api = {
			editMessageText: async (p: { text: unknown }) => {
				edited = p;
				return true;
			},
		};
		const bg = await engine.background({ api } as never, "k", {
			from: { id: 1, username: "neo" },
		} as never);
		await bg.switchTo("b", ShowMode.Edit);
		expect(edited?.text).toBe("u:neo"); // override reached the getter (was "none")
	});
});
