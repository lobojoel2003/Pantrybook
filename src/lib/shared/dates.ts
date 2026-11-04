/**
 * Calendar-date helpers that work on `YYYY-MM-DD` strings.
 * All arithmetic happens in UTC so daylight-saving changes never shift a date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const [, y, m, d] = match;
	const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
	return (
		date.getUTCFullYear() === Number(y) &&
		date.getUTCMonth() === Number(m) - 1 &&
		date.getUTCDate() === Number(d)
	);
}

function toUTC(iso: string): Date {
	const match = ISO_DATE.exec(iso);
	if (!match) throw new Error(`Invalid date: ${iso}`);
	return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function fromUTC(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** The local calendar date of a `Date` (defaults to now). */
export function localISODate(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function today(): string {
	return localISODate(new Date());
}

export function addDays(iso: string, days: number): string {
	const date = toUTC(iso);
	date.setUTCDate(date.getUTCDate() + days);
	return fromUTC(date);
}

export function addMonths(iso: string, months: number): string {
	const date = toUTC(iso);
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + months);
	const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
	date.setUTCDate(Math.min(day, last));
	return fromUTC(date);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: string, b: string): number {
	return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function dayOfWeek(iso: string): number {
	return toUTC(iso).getUTCDay();
}

export function startOfWeek(iso: string, weekStartsOn: 0 | 1 = 1): string {
	const offset = (dayOfWeek(iso) - weekStartsOn + 7) % 7;
	return addDays(iso, -offset);
}

export function startOfMonth(iso: string): string {
	return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
	const date = toUTC(startOfMonth(iso));
	date.setUTCMonth(date.getUTCMonth() + 1);
	date.setUTCDate(0);
	return fromUTC(date);
}

export function startOfYear(iso: string): string {
	return `${iso.slice(0, 4)}-01-01`;
}

export function endOfYear(iso: string): string {
	return `${iso.slice(0, 4)}-12-31`;
}

export function startOfQuarter(iso: string): string {
	const month = Number(iso.slice(5, 7));
	const first = Math.floor((month - 1) / 3) * 3 + 1;
	return `${iso.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
}

export function endOfQuarter(iso: string): string {
	return addDays(addMonths(startOfQuarter(iso), 3), -1);
}

/** Whole months elapsed from `from` to `to`, ignoring partial months. */
export function monthsBetween(from: string, to: string): number {
	const a = toUTC(from);
	const b = toUTC(to);
	let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
	if (b.getUTCDate() < a.getUTCDate()) months -= 1;
	return months;
}

/** Every `YYYY-MM` month touched by the inclusive range. */
export function monthsInRange(from: string, to: string): string[] {
	const out: string[] = [];
	let cursor = startOfMonth(from);
	while (cursor <= to) {
		out.push(cursor.slice(0, 7));
		cursor = addMonths(cursor, 1);
	}
	return out;
}

/** Every date in the inclusive range. */
export function datesInRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) out.push(cursor);
	return out;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = JSON.stringify(options);
	let fmt = formatters.get(key);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
		formatters.set(key, fmt);
	}
	return fmt;
}

/** "Nov 4, 2026" */
export function formatDate(iso: string | null | undefined): string {
	if (!iso || !isISODate(iso.slice(0, 10))) return '';
	return formatter({ month: 'short', day: 'numeric', year: 'numeric' }).format(
		toUTC(iso.slice(0, 10))
	);
}

/** "Wed, Nov 4" */
export function formatShortDate(iso: string): string {
	if (!isISODate(iso)) return '';
	return formatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(toUTC(iso));
}

/** "Wednesday, November 4, 2026" */
export function formatLongDate(iso: string): string {
	if (!isISODate(iso)) return '';
	return formatter({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(
		toUTC(iso)
	);
}

/** "Nov 2026" for a `YYYY-MM` month. */
export function formatMonth(month: string): string {
	return formatter({ month: 'short', year: 'numeric' }).format(toUTC(`${month}-01`));
}

/** Local time of day for an ISO timestamp, such as "2:05 PM". */
export function formatTime(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "just now", "5 min ago", "3 h ago", or a date. */
export function formatRelative(timestamp: string | null | undefined, now = Date.now()): string {
	if (!timestamp) return 'never';
	const then = new Date(timestamp).getTime();
	if (Number.isNaN(then)) return '';
	const seconds = Math.round((now - then) / 1000);
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return formatDate(localISODate(new Date(then)));
}
