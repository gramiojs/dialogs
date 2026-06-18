import type { DialogManager } from "../manager.ts";
import type {
	DataDict,
	Keyboard,
	RawButton,
	RenderContext,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";

export type ItemsGetter<T> = (data: DataDict) => readonly T[];
export type ItemId<T> = (item: T) => string | number;

export interface ListGroupOptions<T> {
	id: string;
	items: ItemsGetter<T>;
	itemId: ItemId<T>;
	/**
	 * Inner widgets rendered once **per item**. Each receives `{ item, itemId }`
	 * in render data, has its own per-item widget-data namespace, and its
	 * callbacks are routed back with the item in scope.
	 */
	widgets: Keyboard[];
	when?: WhenCondition;
}

const SEP = "~";

function encode(
	itemId: string,
	widgetId: string,
	payload: string | undefined,
): string {
	return `${itemId}${SEP}${widgetId}${SEP}${payload ?? ""}`;
}

function decode(value: string): {
	itemId: string;
	widgetId: string;
	payload?: string;
} {
	const a = value.indexOf(SEP);
	const b = value.indexOf(SEP, a + 1);
	const itemId = value.slice(0, a);
	const widgetId = value.slice(a + 1, b);
	const payload = value.slice(b + 1);
	return { itemId, widgetId, payload: payload === "" ? undefined : payload };
}

/**
 * Repeats a set of widgets for each item in a list (aiogram_dialog `ListGroup`).
 *
 * Per-item widget state works out of the box: stateful inner widgets (Checkbox,
 * Counter…) read/write a widget-data namespace scoped to the item id.
 *
 * Constraint: item ids and inner widget ids must not contain `~`.
 */
class ListGroupWidget<T> extends KeyboardWidget {
	constructor(
		private readonly opts: ListGroupOptions<T>,
		when?: WhenCondition,
	) {
		super(when);
	}

	private remap(button: RawButton, itemId: string): RawButton {
		if (!button.cb) return button;
		return {
			text: button.text,
			cb: {
				widgetId: this.opts.id,
				payload: encode(itemId, button.cb.widgetId, button.cb.payload),
			},
		};
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		const list = this.opts.items(rc.data);
		const out: RawButton[][] = [];
		for (let index = 0; index < list.length; index++) {
			const item = list[index] as T;
			const itemId = String(this.opts.itemId(item));
			const itemRc: RenderContext = {
				manager: rc.manager,
				data: { ...rc.data, item, itemId, index },
			};
			rc.manager.pushScope(`${this.opts.id}#${itemId}`);
			for (const widget of this.opts.widgets) {
				const rows = await widget.renderKeyboard(itemRc);
				for (const row of rows) out.push(row.map((b) => this.remap(b, itemId)));
			}
			rc.manager.popScope();
		}
		return out;
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const {
			itemId,
			widgetId: innerId,
			payload: innerPayload,
		} = decode(payload);

		manager.pushScope(`${this.opts.id}#${itemId}`);
		manager.listItemId = itemId;
		let handled = false;
		for (const widget of this.opts.widgets) {
			if (await widget.processCallback(innerId, innerPayload, manager)) {
				handled = true;
				break;
			}
		}
		manager.listItemId = undefined;
		manager.popScope();
		return handled;
	}
}

export function ListGroup<T>(options: ListGroupOptions<T>): Keyboard {
	return new ListGroupWidget(options, options.when);
}

/** Inside a ListGroup inner widget's `onClick`, the id of the row that was clicked. */
export function listItemId(manager: DialogManager): string | undefined {
	return manager.listItemId;
}
