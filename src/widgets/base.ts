import type { DialogManager } from "../manager.ts";
import type {
	AnyData,
	DataDict,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	WhenCondition,
} from "../types.ts";

export function isHidden<D extends AnyData = DataDict>(
	when: WhenCondition<D> | undefined,
	rc: RenderContext<D>,
): boolean {
	if (when === undefined) return false;
	return !(typeof when === "function" ? when(rc) : when);
}

export function chunk<T>(items: T[], size: number): T[][] {
	if (size <= 0) return [items];
	const rows: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		rows.push(items.slice(i, i + size));
	return rows;
}

/** Base for all keyboard widgets — handles the `when` visibility gate. */
export abstract class KeyboardWidget implements Keyboard {
	protected readonly when?: WhenCondition;

	constructor(when?: WhenCondition) {
		this.when = when;
	}

	async renderKeyboard(rc: RenderContext): Promise<RawButton[][]> {
		if (isHidden(this.when, rc)) return [];
		return this.render(rc);
	}

	protected abstract render(rc: RenderContext): MaybePromise<RawButton[][]>;

	abstract processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): MaybePromise<boolean>;
}
