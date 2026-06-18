import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	TextSource,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";
import { asText } from "./text.ts";

export interface StarsButtonOptions {
	id: string;
	/** Button label. */
	text: TextSource;
	/** Invoice title shown to the user. */
	title: string;
	description: string;
	/** Price in Telegram Stars. */
	stars: number;
	/** Internal invoice payload (1–128 bytes). Defaults to the widget id. */
	payload?: string;
	/** Price-line label. Defaults to the title. */
	label?: string;
	/** Called after the invoice is sent (payment success is a bot-level update). */
	onInvoice?: (ctx: ClickCtx) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/**
 * A button that sends a [Telegram Stars](https://core.telegram.org/bots/payments#telegram-stars)
 * invoice (`sendInvoice`, currency `XTR`) on tap. Answer `pre_checkout_query`
 * and handle `successful_payment` at the bot level to complete the purchase.
 */
class StarsButtonWidget extends KeyboardWidget {
	private readonly label: TextWidget;

	constructor(private readonly opts: StarsButtonOptions) {
		super(opts.when);
		this.label = asText(opts.text);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		return [
			[
				{
					text: String(await this.label.renderText(rc)),
					cb: { widgetId: this.opts.id },
				},
			],
		];
	}

	async processCallback(
		widgetId: string,
		_payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id) return false;
		const ctx = manager.ctx as { chatId?: number; senderId?: number };
		await manager.ctx.bot.api.sendInvoice({
			chat_id: (ctx.chatId ?? ctx.senderId) as number,
			title: this.opts.title,
			description: this.opts.description,
			payload: this.opts.payload ?? this.opts.id,
			currency: "XTR",
			prices: [
				{ label: this.opts.label ?? this.opts.title, amount: this.opts.stars },
			],
		});
		await this.opts.onInvoice?.(manager.clickCtx);
		return true;
	}
}

export function StarsButton(options: StarsButtonOptions): Keyboard {
	return new StarsButtonWidget(options);
}
