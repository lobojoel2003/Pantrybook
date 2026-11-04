import { addDays, endOfMonth, endOfYear, startOfMonth, startOfWeek, startOfYear } from './dates.ts';
import type { LimitPeriod } from './types.ts';

export interface LimitRule {
	limit_count: number | null;
	limit_period: LimitPeriod | null;
	limit_days: number | null;
}

export interface Eligibility {
	/** Whether the program has a limit at all. */
	limited: boolean;
	/** Whether one more visit on `date` stays within the limit. */
	allowed: boolean;
	/** Visits already counted in the current period. */
	used: number;
	limit: number | null;
	periodStart: string | null;
	periodEnd: string | null;
	/** First date the household can visit again within the limit, when `allowed` is false. */
	nextEligible: string | null;
	/** Short summary such as "2 of 4 this month". */
	summary: string;
}

export const LIMIT_PERIODS: { value: LimitPeriod; label: string }[] = [
	{ value: 'day', label: 'per day' },
	{ value: 'week', label: 'per calendar week' },
	{ value: 'month', label: 'per calendar month' },
	{ value: 'year', label: 'per calendar year' },
	{ value: 'rolling', label: 'every N days (rolling)' }
];

export function hasLimit(rule: LimitRule): boolean {
	if (rule.limit_count === null || rule.limit_count < 1 || !rule.limit_period) return false;
	if (rule.limit_period === 'rolling') return (rule.limit_days ?? 0) >= 1;
	return true;
}

/** The inclusive date range that a visit on `date` is counted in. */
export function limitWindow(
	rule: LimitRule,
	date: string,
	weekStartsOn: 0 | 1 = 1
): { start: string; end: string } | null {
	if (!hasLimit(rule)) return null;
	switch (rule.limit_period) {
		case 'day':
			return { start: date, end: date };
		case 'week': {
			const start = startOfWeek(date, weekStartsOn);
			return { start, end: addDays(start, 6) };
		}
		case 'month':
			return { start: startOfMonth(date), end: endOfMonth(date) };
		case 'year':
			return { start: startOfYear(date), end: endOfYear(date) };
		case 'rolling':
			return { start: addDays(date, -((rule.limit_days ?? 1) - 1)), end: date };
		default:
			return null;
	}
}

const PERIOD_WORD: Record<Exclude<LimitPeriod, 'rolling'>, string> = {
	day: 'today',
	week: 'this week',
	month: 'this month',
	year: 'this year'
};

/** "4 visits per month", "1 visit every 7 days", "No limit". */
export function describeLimit(rule: LimitRule): string {
	if (!hasLimit(rule)) return 'No limit';
	const count = rule.limit_count ?? 0;
	const visits = `${count} visit${count === 1 ? '' : 's'}`;
	if (rule.limit_period === 'rolling') {
		const days = rule.limit_days ?? 1;
		return `${visits} every ${days} day${days === 1 ? '' : 's'}`;
	}
	return `${visits} per ${rule.limit_period}`;
}

/** Most visits in any `days`-long window that contains `date` (rolling limits). */
function busiestRollingWindow(
	visitDates: string[],
	date: string,
	days: number
): { used: number; start: string; end: string } {
	const earliest = addDays(date, -(days - 1));
	const latest = addDays(date, days - 1);
	const nearby = visitDates.filter((d) => d >= earliest && d <= latest);
	// The count only changes when a visit enters on the right, so it peaks either at the
	// leftmost window or at a window ending on one of the later visits.
	const starts = [earliest, ...nearby.filter((d) => d >= date).map((d) => addDays(d, -(days - 1)))];
	let best = { used: -1, start: earliest, end: date };
	for (const start of starts) {
		const end = addDays(start, days - 1);
		const used = nearby.filter((d) => d >= start && d <= end).length;
		if (used > best.used) best = { used, start, end };
	}
	return best;
}

/**
 * Decide whether a household may visit a program on `date`.
 *
 * Rolling limits look both ways, so a visit entered late (offline, or from a paper sheet)
 * is still caught when a later visit already fills the window.
 *
 * @param visitDates dates of the household's other non-voided visits to this program
 */
export function evaluateEligibility(
	rule: LimitRule,
	visitDates: string[],
	date: string,
	weekStartsOn: 0 | 1 = 1
): Eligibility {
	const window = limitWindow(rule, date, weekStartsOn);
	if (!window) {
		return {
			limited: false,
			allowed: true,
			used: visitDates.filter((d) => d === date).length,
			limit: null,
			periodStart: null,
			periodEnd: null,
			nextEligible: null,
			summary: 'No limit'
		};
	}

	const limit = rule.limit_count ?? 0;
	let used: number;
	let periodStart = window.start;
	let periodEnd = window.end;
	let nextEligible: string | null = null;

	if (rule.limit_period === 'rolling') {
		const days = rule.limit_days ?? 1;
		const busiest = busiestRollingWindow(visitDates, date, days);
		used = busiest.used;
		periodStart = busiest.start;
		periodEnd = busiest.end;
		if (used >= limit) {
			const later = visitDates.some((d) => d > date);
			if (!later) {
				// The window must drop enough old visits for the count to fall below the limit.
				const inWindow = visitDates.filter((d) => d >= window.start && d <= date).sort();
				nextEligible = addDays(inWindow[inWindow.length - limit], days);
			} else {
				// Rare (back-dated entries): walk forward to the first day that fits.
				for (let i = 1; i <= days * 2 && !nextEligible; i++) {
					const candidate = addDays(date, i);
					if (busiestRollingWindow(visitDates, candidate, days).used < limit) {
						nextEligible = candidate;
					}
				}
			}
		}
	} else {
		used = visitDates.filter((d) => d >= window.start && d <= window.end).length;
		if (used >= limit) nextEligible = addDays(window.end, 1);
	}

	const periodWord =
		rule.limit_period === 'rolling'
			? `in ${rule.limit_days} day${rule.limit_days === 1 ? '' : 's'}`
			: PERIOD_WORD[rule.limit_period as Exclude<LimitPeriod, 'rolling'>];

	return {
		limited: true,
		allowed: used < limit,
		used,
		limit,
		periodStart,
		periodEnd,
		nextEligible,
		summary: `${used} of ${limit} ${periodWord}`
	};
}
