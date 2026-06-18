import type {
	DataDict,
	Getter,
	InputCtx,
	InputWidget,
	Keyboard,
	MaybePromise,
	MediaWidget,
	TextSource,
	TextWidget,
} from "./types.ts";
import { asText } from "./widgets/text.ts";

export interface WindowOptions<Data extends DataDict = DataDict> {
	/** Unique state key within the owning dialog. */
	state: string;
	/** Window text: a bare string, `(data) => …`, or a text widget. */
	text?: TextSource<Data>;
	keyboard?: Keyboard<Data>;
	media?: MediaWidget<Data>;
	/** Loads data for this window before rendering. */
	getter?: Getter<Data>;
	/** Typed input widget (e.g. {@link TextInput}) consulted before `onMessage`. */
	input?: InputWidget;
	/** Handler for free-text input while this window is shown. */
	onMessage?: (ctx: InputCtx) => MaybePromise<unknown>;
	/** Disable the link preview for this window's message. */
	disableWebPreview?: boolean;
	/**
	 * Render the keyboard as a **reply keyboard** instead of inline. Callbacks
	 * are smuggled through invisible characters in the button text, so all the
	 * usual widgets keep working. Reply-keyboard windows always send a new
	 * message (reply keyboards cannot be edited in place).
	 */
	reply?: boolean;
}

/**
 * A single screen of a dialog, bound to one state key.
 *
 * Generic over its getter's `Data`: when you type the getter, the text /
 * keyboard / media widgets are checked against that `Data`. Defaults to the
 * loose {@link DataDict} so untyped windows keep working.
 *
 * Pure composition of widgets — no logic of its own beyond delegating to its
 * text / keyboard / media widgets and `onMessage` handler.
 */
export class Window<Data extends DataDict = DataDict> {
	readonly state: string;
	readonly text?: TextWidget<Data>;
	readonly keyboard?: Keyboard<Data>;
	readonly media?: MediaWidget<Data>;
	readonly getter?: Getter<Data>;
	readonly input?: InputWidget;
	readonly onMessage?: (ctx: InputCtx) => MaybePromise<unknown>;
	readonly disableWebPreview: boolean;
	readonly reply: boolean;

	constructor(options: WindowOptions<Data>) {
		this.state = options.state;
		this.text = options.text === undefined ? undefined : asText(options.text);
		this.keyboard = options.keyboard;
		this.media = options.media;
		this.getter = options.getter;
		this.input = options.input;
		this.onMessage = options.onMessage;
		this.disableWebPreview = options.disableWebPreview ?? false;
		this.reply = options.reply ?? false;
	}

	handlesInput(): boolean {
		return this.input !== undefined || this.onMessage !== undefined;
	}
}
