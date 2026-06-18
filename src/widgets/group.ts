import type { DialogManager } from "../manager.ts";
import type {
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget, chunk } from "./base.ts";

export interface GroupOptions {
	/** Re-wrap all child buttons into rows of this width. Omit to keep child layout. */
	width?: number;
	when?: WhenCondition;
}

/** Composite keyboard: concatenates child layouts, optionally re-wrapping by width. */
class GroupWidget extends KeyboardWidget {
	constructor(
		private readonly children: Keyboard[],
		private readonly width: number | undefined,
		when?: WhenCondition,
	) {
		super(when);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const childRows = await Promise.all(
			this.children.map((child) => child.renderKeyboard(rc)),
		);
		const rows = childRows.flat();
		if (this.width === undefined) return rows;
		return chunk(rows.flat(), this.width);
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		for (const child of this.children) {
			if (await child.processCallback(widgetId, payload, manager)) return true;
		}
		return false;
	}
}

export function Group(
	children: Keyboard[],
	options: GroupOptions = {},
): Keyboard {
	return new GroupWidget(children, options.width, options.when);
}

/** All child buttons on a single row. */
export function Row(
	children: Keyboard[],
	options: { when?: WhenCondition } = {},
): Keyboard {
	return new RowColumnWidget(children, "row", options.when);
}

/** Each child button on its own row. */
export function Column(
	children: Keyboard[],
	options: { when?: WhenCondition } = {},
): Keyboard {
	return new RowColumnWidget(children, "column", options.when);
}

class RowColumnWidget extends KeyboardWidget {
	constructor(
		private readonly children: Keyboard[],
		private readonly layout: "row" | "column",
		when?: WhenCondition,
	) {
		super(when);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const childRows = await Promise.all(
			this.children.map((child) => child.renderKeyboard(rc)),
		);
		// `column` stacks children vertically, preserving each child's own rows
		// (so a Counter's 3-in-a-row stays intact). `row` merges everything into
		// a single row.
		const rows = childRows.flat();
		return this.layout === "row" ? [rows.flat()] : rows;
	}

	processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): MaybePromise<boolean> {
		return tryChildren(this.children, widgetId, payload, manager);
	}
}

async function tryChildren(
	children: Keyboard[],
	widgetId: string,
	payload: string | undefined,
	manager: DialogManager,
): Promise<boolean> {
	for (const child of children) {
		if (await child.processCallback(widgetId, payload, manager)) return true;
	}
	return false;
}
