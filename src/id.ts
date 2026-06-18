const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function toBase36(n: number): string {
	let x = Math.max(0, Math.floor(n));
	let s = "";
	while (x > 0) {
		s = ALPHABET[x % 36] + s;
		x = Math.floor(x / 36);
	}
	return s || "0";
}

const COUNTER_SPACE = 36 ** 4; // 4 base36 chars → ~1.68M ids before wrap
const TIME_SPACE = 36 ** 6; // ~25 days of millisecond resolution

// Random start so ids from different process runs are unlikely to collide.
let counter = Math.floor(Math.random() * COUNTER_SPACE);

/**
 * Short, base36 id for dialog instances (intents) and stacks.
 *
 * Mirrors aiogram_dialog's compact intent id: short enough to fit inside the
 * 64-byte `callback_data` budget, but **collision-free within a process** — a
 * monotonic counter (fixed 4-char suffix) guarantees that two ids minted in the
 * same millisecond differ, which the stale-button check and multi-stack routing
 * rely on. The time prefix keeps ids roughly ordered and distinct across runs.
 */
export function shortId(): string {
	counter = (counter + 1) % COUNTER_SPACE;
	const time = toBase36(Date.now() % TIME_SPACE);
	const seq = toBase36(counter).padStart(4, "0");
	return time + seq; // time prefix + fixed-width counter suffix (unambiguous)
}
