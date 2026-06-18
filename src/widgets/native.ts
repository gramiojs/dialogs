import type { DialogManager } from "../manager.ts";
import type {
	ClickCtx,
	Keyboard,
	MaybePromise,
	RawButton,
	RenderContext,
	ReplyRequest,
	TextSource,
	TextWidget,
	WhenCondition,
} from "../types.ts";
import { KeyboardWidget } from "./base.ts";
import { asText } from "./text.ts";

function chatIdOf(manager: DialogManager): number {
	const ctx = manager.ctx as { chatId?: number; senderId?: number };
	return (ctx.chatId ?? ctx.senderId) as number;
}

// ───────────────────────── Poll / Quiz ─────────────────────────

export interface PollOptions {
	id: string;
	/** Button label. */
	text: TextSource;
	question: string;
	options: readonly string[];
	/** Send a quiz (single correct answer) instead of a regular poll. */
	quiz?: boolean;
	correctOptionId?: number;
	/** Defaults to true. */
	anonymous?: boolean;
	allowsMultipleAnswers?: boolean;
	onSent?: (ctx: ClickCtx) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A button that sends a native poll/quiz (`sendPoll`) to the chat on tap. */
class PollWidget extends KeyboardWidget {
	private readonly label: TextWidget;

	constructor(private readonly opts: PollOptions) {
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
		await manager.ctx.bot.api.sendPoll({
			chat_id: chatIdOf(manager),
			question: this.opts.question,
			options: this.opts.options.map((text) => ({ text })),
			type: this.opts.quiz ? "quiz" : "regular",
			correct_option_ids:
				this.opts.correctOptionId === undefined
					? undefined
					: [this.opts.correctOptionId],
			is_anonymous: this.opts.anonymous ?? true,
			allows_multiple_answers: this.opts.allowsMultipleAnswers,
		});
		await this.opts.onSent?.(manager.clickCtx);
		return true;
	}
}

export function Poll(options: PollOptions): Keyboard {
	return new PollWidget(options);
}

// ───────────────────────── Reactions ─────────────────────────

export interface ReactionsOptions {
	id: string;
	/** Emoji to choose from, e.g. `["👍", "❤️", "🔥"]`. */
	items: readonly string[];
	/** Allow selecting several. Defaults to false (single). */
	multi?: boolean;
	default?: string | readonly string[];
	onChanged?: (ctx: ClickCtx, selected: string[]) => MaybePromise<unknown>;
	when?: WhenCondition;
}

/** A row of emoji the user can react with; stores the selection in widget data. */
class ReactionsWidget extends KeyboardWidget {
	private readonly initial: string[];

	constructor(private readonly opts: ReactionsOptions) {
		super(opts.when);
		this.initial =
			opts.default === undefined
				? []
				: Array.isArray(opts.default)
					? [...opts.default]
					: [opts.default as string];
	}

	private selected(manager: DialogManager): string[] {
		return manager.widgetData<string[]>(this.opts.id, [...this.initial]);
	}

	protected render(rc: RenderContext): RawButton[][] {
		const selected = this.selected(rc.manager);
		return [
			this.opts.items.map((emoji, i) => ({
				text: selected.includes(emoji) ? `[${emoji}]` : emoji,
				cb: { widgetId: this.opts.id, payload: String(i) },
			})),
		];
	}

	async processCallback(
		widgetId: string,
		payload: string | undefined,
		manager: DialogManager,
	): Promise<boolean> {
		if (widgetId !== this.opts.id || payload === undefined) return false;
		const emoji = this.opts.items[Number.parseInt(payload, 10)];
		if (emoji === undefined) return true;
		let selected = this.selected(manager);
		if (this.opts.multi)
			selected = selected.includes(emoji)
				? selected.filter((e) => e !== emoji)
				: [...selected, emoji];
		else selected = selected.includes(emoji) ? [] : [emoji];
		manager.setWidgetData(this.opts.id, selected);
		await this.opts.onChanged?.(manager.clickCtx, [...selected]);
		return true;
	}
}

export function Reactions(options: ReactionsOptions): Keyboard {
	return new ReactionsWidget(options);
}

/** Read a {@link Reactions} widget's current selection. */
export function getReactions(manager: DialogManager, id: string): string[] {
	return [...manager.widgetData<string[]>(id, [])];
}

// ───────────────────────── reply-keyboard request buttons ─────────────────────────

let reqCounter = 0;
function nextRequestId(): number {
	reqCounter = (reqCounter % 1_000_000) + 1;
	return reqCounter;
}

/** A reply-keyboard request button. Use inside a `reply: true` window. */
class RequestButtonWidget extends KeyboardWidget {
	private readonly label: TextWidget;

	constructor(
		text: TextSource,
		private readonly request: ReplyRequest,
		when?: WhenCondition,
	) {
		super(when);
		this.label = asText(text);
	}

	protected async render(rc: RenderContext): Promise<RawButton[][]> {
		return [
			[
				{
					text: String(await this.label.renderText(rc)),
					request: this.request,
				},
			],
		];
	}

	processCallback(): boolean {
		return false; // request buttons produce service messages, not callbacks
	}
}

export interface RequestUserOptions {
	text: TextSource;
	requestId?: number;
	/** Max users to pick (`max_quantity`). */
	max?: number;
	options?: Record<string, unknown>;
	when?: WhenCondition;
}

/** Reply button opening a user picker → `users_shared` service message (read with `getSharedUsers`). */
export function RequestUser(o: RequestUserOptions): Keyboard {
	return new RequestButtonWidget(
		o.text,
		{
			kind: "users",
			requestId: o.requestId ?? nextRequestId(),
			options: { max_quantity: o.max, ...o.options },
		},
		o.when,
	);
}

export interface RequestChatOptions {
	text: TextSource;
	requestId?: number;
	/** Pick a channel instead of a group/user chat. */
	channel?: boolean;
	options?: Record<string, unknown>;
	when?: WhenCondition;
}

/** Reply button opening a chat picker → `chat_shared` service message (read with `getSharedChat`). */
export function RequestChat(o: RequestChatOptions): Keyboard {
	return new RequestButtonWidget(
		o.text,
		{
			kind: "chat",
			requestId: o.requestId ?? nextRequestId(),
			options: { chat_is_channel: o.channel ?? false, ...o.options },
		},
		o.when,
	);
}

/** Reply button that shares the user's phone number as a contact. */
export function ContactRequest(o: {
	text: TextSource;
	when?: WhenCondition;
}): Keyboard {
	return new RequestButtonWidget(o.text, { kind: "contact" }, o.when);
}

/** Reply button that shares the user's current location. */
export function LocationButton(o: {
	text: TextSource;
	when?: WhenCondition;
}): Keyboard {
	return new RequestButtonWidget(o.text, { kind: "location" }, o.when);
}

/** Read the `user_ids` from a `users_shared` service message (in `onMessage`). */
export function getSharedUsers(ctx: unknown): number[] {
	const c = ctx as {
		usersShared?: { userIds?: number[] };
		update?: { message?: { users_shared?: { user_ids?: number[] } } };
	};
	return (
		c.usersShared?.userIds ?? c.update?.message?.users_shared?.user_ids ?? []
	);
}

/** Read the `chat_id` from a `chat_shared` service message (in `onMessage`). */
export function getSharedChat(ctx: unknown): number | undefined {
	const c = ctx as {
		chatShared?: { chatId?: number };
		update?: { message?: { chat_shared?: { chat_id?: number } } };
	};
	return c.chatShared?.chatId ?? c.update?.message?.chat_shared?.chat_id;
}
