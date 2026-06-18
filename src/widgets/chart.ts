import type { DataDict, TextWidget } from "../types.ts";

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// ───────────────────────── Sparkline ─────────────────────────

export interface SparklineOptions {
	values: (data: DataDict) => readonly number[];
	min?: number;
	max?: number;
}

/** An inline mini-chart `▁▂▃▅▇` built from a number series. */
export function Sparkline(options: SparklineOptions): TextWidget {
	return {
		renderText: (rc) => {
			const values = options.values(rc.data);
			if (values.length === 0) return "";
			const min = options.min ?? Math.min(...values);
			const max = options.max ?? Math.max(...values);
			const range = max - min || 1;
			return values
				.map((v) => SPARK[clamp(Math.round(((v - min) / range) * 7), 0, 7)])
				.join("");
		},
	};
}

// ───────────────────────── BarChart ─────────────────────────

export interface BarChartItem {
	label: string;
	value: number;
}

export interface BarChartOptions {
	data: (data: DataDict) => readonly BarChartItem[];
	width?: number;
	fill?: string;
	empty?: string;
	/** Scale max. Defaults to the largest value. */
	max?: number;
	/** Append the numeric value. Defaults to true. */
	showValue?: boolean;
}

/** A horizontal bar chart, one labelled row per item (multi-line text). */
export function BarChart(options: BarChartOptions): TextWidget {
	const fill = options.fill ?? "█";
	const empty = options.empty ?? "░";
	const width = options.width ?? 10;
	return {
		renderText: (rc) => {
			const items = options.data(rc.data);
			if (items.length === 0) return "";
			const max = options.max ?? Math.max(1, ...items.map((i) => i.value));
			const labelWidth = Math.max(...items.map((i) => i.label.length));
			return items
				.map((item) => {
					const n = clamp(Math.round((item.value / max) * width), 0, width);
					const bar = fill.repeat(n) + empty.repeat(width - n);
					const label = item.label.padEnd(labelWidth);
					const value = options.showValue === false ? "" : ` ${item.value}`;
					return `${label} ${bar}${value}`;
				})
				.join("\n");
		},
	};
}

// ───────────────────────── Gauge ─────────────────────────

export interface GaugeOptions {
	/** 0–100 percentage read from data. */
	value: (data: DataDict) => number;
	/** Number of segments. Defaults to 5. */
	size?: number;
	fill?: string;
	empty?: string;
	/** Append ` 60%`. Defaults to true. */
	showPercent?: boolean;
}

/** A discrete dial `●●●○○ 60%`. */
export function Gauge(options: GaugeOptions): TextWidget {
	const fill = options.fill ?? "●";
	const empty = options.empty ?? "○";
	const size = options.size ?? 5;
	return {
		renderText: (rc) => {
			const pct = clamp(options.value(rc.data), 0, 100);
			const n = clamp(Math.round((pct / 100) * size), 0, size);
			const dial = fill.repeat(n) + empty.repeat(size - n);
			const suffix =
				options.showPercent === false ? "" : ` ${Math.round(pct)}%`;
			return `${dial}${suffix}`;
		},
	};
}
