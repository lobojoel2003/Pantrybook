import { describe, expect, it } from 'vitest';
import {
	addDays,
	addMonths,
	datesInRange,
	diffDays,
	endOfMonth,
	endOfQuarter,
	formatRelative,
	isISODate,
	monthsBetween,
	monthsInRange,
	startOfQuarter,
	startOfWeek
} from './dates.ts';

describe('dates', () => {
	it('validates ISO dates, including leap years', () => {
		expect(isISODate('2024-02-29')).toBe(true);
		expect(isISODate('2026-02-29')).toBe(false);
		expect(isISODate('2026-13-01')).toBe(false);
		expect(isISODate('2026-1-01')).toBe(false);
		expect(isISODate(20260101)).toBe(false);
	});

	it('adds days across month, year and DST boundaries', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('adds months and clamps to the end of shorter months', () => {
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
		expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
	});

	it('finds week, month and quarter boundaries', () => {
		// 2026-11-04 is a Wednesday.
		expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
		expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
		expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26');
		expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
		expect(startOfQuarter('2026-11-04')).toBe('2026-10-01');
		expect(endOfQuarter('2026-11-04')).toBe('2026-12-31');
	});

	it('measures differences', () => {
		expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
		expect(monthsBetween('2025-11-04', '2026-11-04')).toBe(12);
		expect(monthsBetween('2025-11-05', '2026-11-04')).toBe(11);
		expect(monthsInRange('2026-11-20', '2027-01-03')).toEqual(['2026-11', '2026-12', '2027-01']);
		expect(datesInRange('2026-11-29', '2026-12-02')).toHaveLength(4);
	});

	it('formats relative times', () => {
		const now = Date.parse('2026-11-04T12:00:00Z');
		expect(formatRelative('2026-11-04T11:59:40Z', now)).toBe('just now');
		expect(formatRelative('2026-11-04T11:50:00Z', now)).toBe('10 min ago');
		expect(formatRelative('2026-11-04T09:00:00Z', now)).toBe('3 h ago');
		expect(formatRelative(null, now)).toBe('never');
	});
});
