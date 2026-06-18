type StreamCtx = {
	// method shorthand → bivariant params, so a real gramio context is assignable
	bot: {
		api: {
			sendMessageDraft(p: {
				chat_id: number;
				draft_id: number;
				text?: string;
			}): unknown;
			sendMessage(p: {
				chat_id: number;
				text: string;
				[key: string]: unknown;
			}): unknown;
		};
	};
	chatId?: number;
	senderId?: number;
};

let draftCounter = 0;
function nextDraftId(): number {
	draftCounter = (draftCounter % 2_000_000_000) + 1;
	return draftCounter;
}

export interface StreamOptions {
	/** Draft id (reused across updates → animated). Defaults to an auto value. */
	draftId?: number;
	/** Minimum ms between draft updates (rate-limit guard). Defaults to 700. */
	throttleMs?: number;
	/** Extra params merged into the final `sendMessage` (e.g. `reply_markup`). */
	finalParams?: Record<string, unknown>;
	/** Current-time provider (defaults to `Date.now`; inject for tests). */
	now?: () => number;
}

/**
 * Stream a generated message to a **private chat** using `sendMessageDraft`
 * (Telegram's AI-bot streaming API): each update animates the ephemeral draft,
 * and the accumulated text is persisted with a final `sendMessage`. Draft errors
 * (groups, the 30-second preview window) are swallowed — the final message always
 * sends. Returns the full text.
 *
 * @example
 * ```ts
 * Button("Ask", { id: "ask", onClick: (ctx) =>
 *   stream(ctx, llm.streamTokens(prompt)) // any AsyncIterable<string>
 * });
 * ```
 */
export async function stream(
	ctx: StreamCtx,
	source: AsyncIterable<string>,
	options: StreamOptions = {},
): Promise<string> {
	const chatId = (ctx.chatId ?? ctx.senderId) as number;
	const draftId = options.draftId ?? nextDraftId();
	const throttle = options.throttleMs ?? 700;
	const now = options.now ?? (() => Date.now());

	const draft = async (text: string): Promise<void> => {
		try {
			await ctx.bot.api.sendMessageDraft({
				chat_id: chatId,
				draft_id: draftId,
				text,
			});
		} catch {
			// drafts are best-effort (private-only, 30s preview) — ignore failures
		}
	};

	let acc = "";
	let lastSent = 0;
	await draft(""); // empty text → "Thinking…" placeholder
	for await (const chunk of source) {
		acc += chunk;
		const t = now();
		if (t - lastSent >= throttle) {
			lastSent = t;
			await draft(acc);
		}
	}
	await draft(acc); // ensure the final accumulated draft is shown
	await ctx.bot.api.sendMessage({
		chat_id: chatId,
		text: acc,
		...options.finalParams,
	});
	return acc;
}
