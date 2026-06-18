import { inMemoryStorage } from "@gramio/storage";
import { DIALOG_CB, type DialogCodec } from "../src/callback.ts";
import {
	type DialogStack,
	StackRepository,
	emptyStack,
} from "../src/context.ts";
import type { Dialog } from "../src/dialog.ts";
import { DialogManager } from "../src/manager.ts";
import { DialogRegistry } from "../src/registry.ts";
import type {
	DataDict,
	DialogEvents,
	DialogUpdateCtx,
	I18nResolver,
	RenderContext,
} from "../src/types.ts";

export interface HarnessOptions {
	/** Translator resolver wired into every manager (for the `T` widget). */
	i18n?: I18nResolver;
	/** Overridable engine answers (stale button, access denied). */
	events?: DialogEvents;
	/** Custom callback-data codec. */
	codec?: DialogCodec;
}

export interface Sent {
	kind:
		| "send"
		| "edit"
		| "delete"
		| "media"
		| "editMedia"
		| "poll"
		| "reaction"
		| "invoice";
	text?: string;
	mediaType?: string;
	pollOptions?: string[];
	amount?: number;
	buttons: { text: string; data: string }[][];
	message_id?: number;
}

function str(v: unknown): string | undefined {
	return v === undefined ? undefined : String(v);
}

function buttonsFromMarkup(
	markup: unknown,
): { text: string; data: string }[][] {
	if (!markup) return [];
	const obj = markup as {
		toJSON?: () => {
			inline_keyboard?: { text: string; callback_data?: string }[][];
			keyboard?: { text: string }[][];
		};
	};
	const json = obj.toJSON ? obj.toJSON() : (markup as Record<string, unknown>);
	const inline = (
		json as { inline_keyboard?: { text: string; callback_data?: string }[][] }
	).inline_keyboard;
	if (inline)
		return inline.map((r) =>
			r.map((b) => ({ text: b.text, data: b.callback_data ?? "" })),
		);
	const reply = (json as { keyboard?: { text: string }[][] }).keyboard;
	if (reply)
		return reply.map((r) => r.map((b) => ({ text: b.text, data: "" })));
	return [];
}

/** A fresh, isolated test harness driving the engine against a fake gramio bot. */
export function createHarness(
	dialogs: Dialog[],
	key = "grd:1",
	options: HarnessOptions = {},
) {
	const log: Sent[] = [];
	const answers: (string | undefined)[] = [];
	let seq = 100;
	const registry = new DialogRegistry(dialogs);
	const repo = new StackRepository(inMemoryStorage());

	const media =
		(mediaType: string) =>
		async (p: { caption?: unknown; reply_markup?: unknown }) => {
			const message_id = seq++;
			log.push({
				kind: "media",
				mediaType,
				text: str(p.caption),
				buttons: buttonsFromMarkup(p.reply_markup),
				message_id,
			});
			return { message_id };
		};

	function makeApi() {
		return {
			sendMessage: async (p: { text: unknown; reply_markup?: unknown }) => {
				const message_id = seq++;
				log.push({
					kind: "send",
					text: str(p.text),
					buttons: buttonsFromMarkup(p.reply_markup),
					message_id,
				});
				return { message_id };
			},
			editMessageText: async (p: {
				message_id: number;
				text: unknown;
				reply_markup?: unknown;
			}) => {
				log.push({
					kind: "edit",
					text: str(p.text),
					buttons: buttonsFromMarkup(p.reply_markup),
					message_id: p.message_id,
				});
				return true;
			},
			editMessageMedia: async (p: {
				message_id: number;
				media: { type: string; caption?: unknown };
				reply_markup?: unknown;
			}) => {
				log.push({
					kind: "editMedia",
					mediaType: p.media.type,
					text: str(p.media.caption),
					buttons: buttonsFromMarkup(p.reply_markup),
					message_id: p.message_id,
				});
				return true;
			},
			deleteMessage: async (p: { message_id: number }) => {
				log.push({ kind: "delete", buttons: [], message_id: p.message_id });
				return true;
			},
			sendPhoto: media("photo"),
			sendVideo: media("video"),
			sendAnimation: media("animation"),
			sendAudio: media("audio"),
			sendDocument: media("document"),
			sendPoll: async (p: {
				question: unknown;
				options?: { text: unknown }[];
			}) => {
				const message_id = seq++;
				log.push({
					kind: "poll",
					text: str(p.question),
					pollOptions: (p.options ?? []).map((o) => String(o.text)),
					buttons: [],
					message_id,
				});
				return { message_id };
			},
			setMessageReaction: async () => {
				log.push({ kind: "reaction", buttons: [] });
				return true;
			},
			sendInvoice: async (p: {
				title: unknown;
				prices?: { amount?: number }[];
			}) => {
				const message_id = seq++;
				log.push({
					kind: "invoice",
					text: str(p.title),
					amount: (p.prices ?? [])[0]?.amount,
					buttons: [],
					message_id,
				});
				return { message_id };
			},
			sendMessageDraft: async () => true,
		};
	}

	function makeCtx(
		kind: "message" | "callback_query",
		data?: string,
		text?: string,
	): DialogUpdateCtx {
		const ctx = {
			is: (name: string) => name === kind,
			data,
			text,
			from: { id: 1, firstName: "Тест" },
			senderId: 1,
			chatId: 1,
			answer: async (p?: string | { text?: string }) => {
				answers.push(typeof p === "string" ? p : p?.text);
				return true;
			},
			send: async (t: unknown) => {
				const message_id = seq++;
				log.push({ kind: "send", text: str(t), buttons: [], message_id });
				return { message_id };
			},
			message: {
				delete: async () => {
					log.push({ kind: "delete", buttons: [] });
					return true;
				},
			},
			bot: { api: makeApi() },
		};
		return ctx as unknown as DialogUpdateCtx;
	}

	async function managerFor(ctx: DialogUpdateCtx): Promise<DialogManager> {
		const store = await repo.loadStore(key);
		return new DialogManager({
			ctx,
			store,
			repo,
			storageKey: key,
			registry,
			i18n: options.i18n,
			events: options.events,
			codec: options.codec,
		});
	}

	async function load(): Promise<DialogStack> {
		return repo.load(key);
	}

	async function topIntent(): Promise<string> {
		return (await load()).intents.at(-1)?.intentId ?? "";
	}

	/** Pack a dialog callback for the current top intent. */
	async function cb(w: string, p?: string): Promise<string> {
		const i = await topIntent();
		return p === undefined
			? DIALOG_CB.pack({ i, w })
			: DIALOG_CB.pack({ i, w, p });
	}

	/** Drive a callback through the engine. */
	async function click(w: string, p?: string): Promise<void> {
		const m = await managerFor(makeCtx("callback_query", await cb(w, p)));
		await m._handleCallback();
	}

	/** Send a raw text message through the engine (input / reply-keyboard tap). */
	async function sendText(text: string): Promise<boolean> {
		const m = await managerFor(makeCtx("message", undefined, text));
		return m._handleMessage();
	}

	/** Start a dialog from a fresh message update and return its manager. */
	async function start(id: string, state?: string): Promise<DialogManager> {
		const m = await managerFor(makeCtx("message"));
		await m.start(id, state);
		return m;
	}

	/** Build a minimal RenderContext for unit-testing a widget's render method. */
	function rc<D extends DataDict = DataDict>(data: D): RenderContext<D> {
		return { data, manager: undefined as never };
	}

	const last = () => log.at(-1) as Sent;
	const flatTexts = () =>
		last()
			.buttons.flat()
			.map((b) => b.text);

	return {
		log,
		answers,
		registry,
		repo,
		key,
		makeApi,
		makeCtx,
		managerFor,
		load,
		topIntent,
		cb,
		click,
		sendText,
		start,
		rc,
		last,
		flatTexts,
		reset: async () => {
			await repo.save(key, emptyStack());
			log.length = 0;
			answers.length = 0;
		},
	};
}
