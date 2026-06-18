import { describe, expect, it } from "bun:test";
import { defineWindow } from "../src/builder.ts";
import { Dialog } from "../src/dialog.ts";
import type { DataDict, RenderContext } from "../src/types.ts";
import { Button } from "../src/widgets/button.ts";
import { Column } from "../src/widgets/group.ts";
import { Const } from "../src/widgets/text.ts";
import { Window } from "../src/window.ts";
import { createHarness } from "./helpers.ts";

const rc = <D extends DataDict>(data: D): RenderContext<D> => ({
	data,
	manager: undefined as never,
});

type Data = {
	user: { name: string };
	count: number;
};

const v = defineWindow<Data>();

describe("typed window (defineWindow / Window<Data>)", () => {
	it("types getter output and text/when data (compile-time)", async () => {
		// these only compile if `d` is typed as Data
		const text = v.text((d) => `${d.user.name}: ${d.count}`);
		const cond = v.when((c) => c.data.count > 0);
		expect(
			await text.renderText(rc({ user: { name: "Lina" }, count: 3 })),
		).toBe("Lina: 3");
		expect(typeof cond).toBe("function");

		// @ts-expect-error — `missing` is not on Data, proving `d` is NOT `any`
		v.text((d) => d.missing);
		// @ts-expect-error — count is number, not string
		v.text((d) => d.count.toUpperCase());
	});

	it("infers Data into a Window through the typed helpers", async () => {
		const window = new Window({
			state: "home",
			getter: v.getter((ctx) => ({
				user: { name: ctx.from?.firstName ?? "?" },
				count: 7,
			})),
			text: v.text((d) => `${d.user.name} #${d.count}`),
			keyboard: Column([
				Button({ text: v.text((d) => `c=${d.count}`), id: "x" }),
				Button({ text: Const("plain"), id: "y" }),
			]),
		});

		// the typed window stores fine alongside untyped ones in a Dialog
		const dialog = new Dialog({ id: "t", windows: [window] });
		const h = createHarness([dialog]);
		await h.reset();
		await (await h.managerFor(h.makeCtx("message"))).start("t");
		expect(h.last().text).toBe("Тест #7");
		expect(h.flatTexts()).toEqual(["c=7", "plain"]);
	});
});
