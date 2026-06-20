import { describe, expect, it } from "bun:test";
import { defineWindow } from "../src/builder.ts";
import { Dialog } from "../src/dialog.ts";
import { defineDialog } from "../src/typed.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

// The whole point of #6: a TS `interface` (no implicit index signature) must
// satisfy the window/getter constraint. If any line below typed `Data` back to
// `object`, `typecheck:all` would fail — so this file is a compile-time proof as
// much as a runtime one.
interface MenuData {
	loggedIn: boolean;
	name: string;
}

describe("interface-typed Data (#6)", () => {
	it("new Window<Interface> compiles and sees typed fields", async () => {
		const dlg = new Dialog({
			id: "iface",
			windows: [
				new Window<MenuData>({
					state: "a",
					getter: () => ({ loggedIn: true, name: "Bob" }),
					text: (d) => `${d.name}:${d.loggedIn}`, // d.name / d.loggedIn typed
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("iface", "a");
		expect(h.last().text).toBe("Bob:true");
	});

	it("defineWindow<Interface>() yields typed getter/text helpers", async () => {
		const v = defineWindow<MenuData>();
		const dlg = new Dialog({
			id: "iface2",
			windows: [
				new Window({
					state: "a",
					getter: v.getter(() => ({ loggedIn: false, name: "X" })),
					text: v.text((d) => `${d.name}/${d.loggedIn}`),
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		await h.start("iface2", "a");
		expect(h.last().text).toBe("X/false");
	});

	it("defineDialog().data<Interface>() accepts an interface", async () => {
		const wb = defineDialog("iface3").states("a").data<MenuData>();
		wb.window("a", {
			getter: () => ({ loggedIn: true, name: "Y" }),
			text: (d) => `${d.name}`,
		});
		const h = createHarness([wb.build()]);
		await h.reset();
		await h.start("iface3", "a");
		expect(h.last().text).toBe("Y");
	});

	it("interface-typed window still reads injected dialogData", async () => {
		const dlg = new Dialog({
			id: "iface4",
			windows: [
				new Window<MenuData>({
					state: "a",
					getter: () => ({ loggedIn: true, name: "Z" }),
					// Data is an interface, yet d.dialogData stays reachable (the engine
					// injects it; RenderData = Data & DataDict keeps the bag indexable).
					text: (d) =>
						`${d.name}:${(d.dialogData as { hi?: string }).hi ?? "-"}`,
				}),
			],
		});
		const h = createHarness([dlg]);
		await h.reset();
		const m = await h.start("iface4", "a");
		expect(h.last().text).toBe("Z:-");
		await m.setData({ hi: "yo" });
		await m.show();
		expect(h.last().text).toBe("Z:yo");
	});
});
