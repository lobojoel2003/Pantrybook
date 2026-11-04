import { describe, expect, it } from 'vitest';
import { describeLimit, evaluateEligibility, hasLimit, limitWindow } from './limits.ts';

const monthly = { limit_count: 4, limit_period: 'month' as const, limit_days: null };
const weekly = { limit_count: 1, limit_period: 'week' as const, limit_days: null };
const rolling = { limit_count: 2, limit_period: 'rolling' as const, limit_days: 30 };
const none = { limit_count: null, limit_period: null, limit_days: null };

describe('visit limits', () => {
	it('describes limits in plain words', () => {
		expect(describeLimit(monthly)).toBe('4 visits per month');
		expect(describeLimit(weekly)).toBe('1 visit per week');
		expect(describeLimit(rolling)).toBe('2 visits every 30 days');
		expect(describeLimit(none)).toBe('No limit');
	});

	it('treats incomplete rules as unlimited', () => {
		expect(hasLimit({ limit_count: 3, limit_period: null, limit_days: null })).toBe(false);
		expect(hasLimit({ limit_count: 3, limit_period: 'rolling', limit_days: null })).toBe(false);
		expect(hasLimit({ limit_count: 0, limit_period: 'month', limit_days: null })).toBe(false);
	});

	it('flags the fifth visit in a month when the limit is four', () => {
		const visits = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];
		const e = evaluateEligibility(monthly, visits, '2026-11-30');
		expect(e.allowed).toBe(false);
		expect(e.used).toBe(4);
		expect(e.nextEligible).toBe('2026-12-01');
		expect(e.summary).toBe('4 of 4 this month');
	});

	it('ignores visits from other months', () => {
		const visits = ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-11-01'];
		const e = evaluateEligibility(monthly, visits, '2026-11-04');
		expect(e.allowed).toBe(true);
		expect(e.used).toBe(1);
		expect(e.nextEligible).toBeNull();
	});

	it('respects the configured first day of the week', () => {
		// Sunday Nov 1 and Wednesday Nov 4 are the same week when weeks start on Sunday,
		// but not when they start on Monday.
		expect(evaluateEligibility(weekly, ['2026-11-01'], '2026-11-04', 0).allowed).toBe(false);
		expect(evaluateEligibility(weekly, ['2026-11-01'], '2026-11-04', 1).allowed).toBe(true);
		expect(limitWindow(weekly, '2026-11-04', 0)).toEqual({
			start: '2026-11-01',
			end: '2026-11-07'
		});
	});

	it('computes the next eligible date for rolling windows', () => {
		const e = evaluateEligibility(rolling, ['2026-10-10', '2026-10-25'], '2026-11-04');
		expect(e.allowed).toBe(false);
		expect(e.nextEligible).toBe('2026-11-09');
		expect(e.summary).toBe('2 of 2 in 30 days');
		// On the next eligible date the oldest visit has left the window.
		expect(evaluateEligibility(rolling, ['2026-10-10', '2026-10-25'], '2026-11-09').allowed).toBe(
			true
		);
	});

	it('catches rolling-limit visits that arrive out of order', () => {
		const once = { limit_count: 1, limit_period: 'rolling' as const, limit_days: 30 };
		// Nov 4 was recorded first; an offline visit dated Nov 3 syncs later.
		const e = evaluateEligibility(once, ['2026-11-04'], '2026-11-03');
		expect(e.allowed).toBe(false);
		expect(e.used).toBe(1);
		// Far enough apart in either direction is fine.
		expect(evaluateEligibility(once, ['2026-12-03'], '2026-11-03').allowed).toBe(true);
		expect(evaluateEligibility(once, ['2026-10-04'], '2026-11-03').allowed).toBe(true);
	});

	it('finds the busiest rolling window around a date', () => {
		const twice = { limit_count: 2, limit_period: 'rolling' as const, limit_days: 10 };
		// Windows containing Nov 5: Nov 7 + Nov 12 share one with it -> 3 visits.
		expect(evaluateEligibility(twice, ['2026-11-07', '2026-11-12'], '2026-11-05').allowed).toBe(
			false
		);
		// Nov 1 and Nov 12 are 11 days apart, so no 10-day window holds all three.
		const e = evaluateEligibility(twice, ['2026-11-01', '2026-11-12'], '2026-11-05');
		expect(e.allowed).toBe(true);
		expect(e.used).toBe(1);
	});

	it('never blocks unlimited programs', () => {
		const e = evaluateEligibility(none, ['2026-11-04', '2026-11-04'], '2026-11-04');
		expect(e.allowed).toBe(true);
		expect(e.limited).toBe(false);
		expect(e.used).toBe(2);
	});
});
