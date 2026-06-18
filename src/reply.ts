/**
 * Reply-keyboard callback fallback.
 *
 * Telegram reply-keyboard buttons carry no `callback_data` — tapping one just
 * sends its text as a message. To still route them like inline callbacks we
 * encode the (packed) dialog callback into a run of invisible characters
 * appended to the button label, then decode it back from the incoming message.
 *
 * Mirrors aiogram_dialog's invisible-symbol trick. Each UTF-8 byte becomes two
 * symbols (low nibble, then high nibble) drawn from a 16-char invisible set.
 */

// 16 invisible code points: zero-width/word-joiner/invisible-math + 8 variation
// selectors (VS1–VS8). All render as nothing when not following a base glyph.
const SYMBOLS = [
	"​",
	"‌",
	"‍",
	"⁠",
	"⁡",
	"⁢",
	"⁣",
	"⁤",
	"︀",
	"︁",
	"︂",
	"︃",
	"︄",
	"︅",
	"︆",
	"︇",
];
const INDEX = new Map(SYMBOLS.map((s, i) => [s, i]));
const encoder = new TextEncoder();

/** Encode a string into an invisible suffix. */
export function encodeReplyData(data: string): string {
	let out = "";
	for (const byte of encoder.encode(data)) {
		out += SYMBOLS[byte & 0x0f];
		out += SYMBOLS[byte >> 4];
	}
	return out;
}

/**
 * Split a message text into its visible part and a decoded invisible payload.
 * Returns `undefined` when there is no trailing invisible run.
 */
export function decodeReplyData(
	text: string,
): { visible: string; data: string } | undefined {
	const chars = [...text];
	let start = chars.length;
	while (start > 0 && INDEX.has(chars[start - 1] as string)) start--;
	const runLength = chars.length - start;
	if (runLength < 2) return undefined;

	const bytes: number[] = [];
	for (let i = start; i + 1 < chars.length; i += 2) {
		const low = INDEX.get(chars[i] as string);
		const high = INDEX.get(chars[i + 1] as string);
		if (low === undefined || high === undefined) return undefined;
		bytes.push(low | (high << 4));
	}
	const data = new TextDecoder().decode(new Uint8Array(bytes));
	return { visible: chars.slice(0, start).join("").trimEnd(), data };
}
