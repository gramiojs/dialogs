import type {
	DataDict,
	RenderContext,
	Stringable,
	TextSource,
	TextWidget,
} from "../types.ts";
import { asText } from "./text.ts";

// ───────────────────────── TypingAction ─────────────────────────

// `api: unknown` keeps any gramio context assignable (its `sendChatAction` has a
// narrower `action` union); we narrow it back internally.
type ActionCtx = {
	bot: { api: unknown };
	chatId?: number;
	senderId?: number;
};

type ChatAction =
	| "typing"
	| "upload_photo"
	| "upload_document"
	| "find_location"
	| (string & {});

/**
 * Show a chat action (default `"typing"`) for ~5s — the cheap way to signal work
 * without sending/editing a message. Call it at the start of a slow handler.
 */
export async function typing(
	ctx: ActionCtx,
	action: ChatAction = "typing",
): Promise<void> {
	const chatId = (ctx.chatId ?? ctx.senderId) as number;
	const api = ctx.bot.api as {
		sendChatAction(p: { chat_id: number; action: string }): unknown;
	};
	await api.sendChatAction({ chat_id: chatId, action });
}

/** Run `fn` while showing a chat action; resolves to `fn`'s result. */
export async function withTyping<T>(
	ctx: ActionCtx,
	fn: () => Promise<T>,
	action?: string,
): Promise<T> {
	await typing(ctx, action);
	return fn();
}

// ───────────────────────── Spinner ─────────────────────────

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export interface SpinnerOptions {
	id: string;
	frames?: readonly string[];
	label?: TextSource;
}

/**
 * A loading indicator that advances one frame each render — animate it by
 * re-rendering on a timer via `createDialogs().background`, or pair with
 * {@link typing}. Standalone it just shows the current frame.
 */
export function Spinner(options: SpinnerOptions): TextWidget {
	const frames = options.frames ?? BRAILLE;
	const label = options.label === undefined ? undefined : asText(options.label);
	return {
		renderText: async (rc) => {
			const i = rc.manager.widgetData<number>(options.id, 0);
			rc.manager.setWidgetData(options.id, (i + 1) % frames.length);
			const text = label ? ` ${String(await label.renderText(rc))}` : "";
			return `${frames[i % frames.length]}${text}`;
		},
	};
}

// ───────────────────────── Countdown ─────────────────────────

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function defaultCountdown(msLeft: number): string {
	const total = Math.max(0, Math.ceil(msLeft / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const body = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
	return `⏳ ${body}`;
}

export interface CountdownOptions {
	/** Target time as a ms-epoch — a number or `(data) => number`. */
	until: number | ((data: DataDict) => number);
	/** Current-time provider (defaults to `Date.now`; inject for tests). */
	now?: () => number;
	/** Format the remaining milliseconds. Defaults to `⏳ MM:SS`. */
	format?: (msLeft: number) => Stringable;
	/** Shown once the target has passed. Defaults to `⏰`. */
	doneText?: TextSource;
}

/**
 * A live countdown text. Re-render it on a timer (via the background manager)
 * to tick — `sendMessageDraft` is **not** suitable here (30s/private-only), so a
 * throttled background edit (e.g. once per second) is the way.
 */
export function Countdown(options: CountdownOptions): TextWidget {
	const now = options.now ?? (() => Date.now());
	const format = options.format ?? defaultCountdown;
	const done =
		options.doneText === undefined ? undefined : asText(options.doneText);
	return {
		renderText: async (rc) => {
			const target =
				typeof options.until === "function"
					? options.until(rc.data)
					: options.until;
			const left = target - now();
			if (left <= 0) return done ? await done.renderText(rc) : "⏰";
			return format(left);
		},
	};
}

// ───────────────────────── LiveProgress ─────────────────────────

export interface LiveProgressOptions {
	/** 0–100 percentage read from data. */
	value: (data: DataDict) => number;
	width?: number;
	fill?: string;
	empty?: string;
	/** Append ` 42%`. Defaults to true. */
	showPercent?: boolean;
	label?: TextSource;
}

/** A progress bar with a percentage label — built for background-driven updates. */
export function LiveProgress(options: LiveProgressOptions): TextWidget {
	const width = options.width ?? 12;
	const fill = options.fill ?? "█";
	const empty = options.empty ?? "░";
	const label = options.label === undefined ? undefined : asText(options.label);
	return {
		renderText: async (rc) => {
			const pct = Math.max(0, Math.min(100, options.value(rc.data)));
			const n = Math.round((pct / 100) * width);
			const bar = fill.repeat(n) + empty.repeat(width - n);
			const prefix = label ? `${String(await label.renderText(rc))} ` : "";
			const suffix =
				options.showPercent === false ? "" : ` ${Math.round(pct)}%`;
			return `${prefix}${bar}${suffix}`;
		},
	};
}
