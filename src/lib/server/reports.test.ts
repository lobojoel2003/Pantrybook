import { describe, expect, it } from 'vitest';
import { parseCSV } from '#lib/shared/csv.ts';
import { buildReport, householdsCSV, reportToCSV, visitsCSV } from './reports.ts';
import { pushChanges } from './sync.ts';
import { addProgram, addUser, householdMutation, testDb, visitMutation } from './test-helpers.ts';

function fixture() {
	const db = testDb();
	const user = addUser(db);
	const food = addProgram(db, { name: 'Food Pantry', limit_count: 1, limit_period: 'month' });
	const baby = addProgram(db, {
		name: 'Baby Closet',
		unit: 'items',
		limit_count: null,
		limit_period: null,
		sort_order: 2
	});
	const a = householdMutation({
		first_name: 'Ana',
		zip: '40121',
		adults: 2,
		children: 1,
		seniors: 0,
		income_eligible: true
	});
	const b = householdMutation({
		first_name: 'Bo',
		zip: '40130',
		adults: 1,
		children: 0,
		seniors: 1
	});
	pushChanges(
		db,
		[
			a,
			b,
			visitMutation(a.data.id, food.id, '2026-10-20', { quantity: 30 }),
			visitMutation(a.data.id, food.id, '2026-11-02', { quantity: 25 }),
			visitMutation(a.data.id, food.id, '2026-11-09', { quantity: 20, override_reason: 'Fire' }),
			visitMutation(a.data.id, baby.id, '2026-11-09', { quantity: 12 }),
			visitMutation(b.data.id, food.id, '2026-11-03', { quantity: 18 })
		],
		user
	);
	return { db, food, baby };
}

describe('reports', () => {
	it('counts unduplicated households and individuals', () => {
		const { db } = fixture();
		const r = buildReport(db, { from: '2026-11-01', to: '2026-11-30', programId: null });
		expect(r.totals).toMatchObject({
			visits: 4,
			households: 2,
			individuals: 5,
			children: 1,
			adults: 3,
			seniors: 1,
			individuals_duplicated: 3 + 3 + 3 + 2,
			income_eligible_households: 1,
			over_limit_visits: 1,
			// Ana first came in October, so only Bo is new in November.
			new_households: 1
		});
		expect(r.granularity).toBe('day');
		expect(r.by_period).toHaveLength(30);
		expect(r.by_period.find((p) => p.period === '2026-11-09')).toEqual({
			period: '2026-11-09',
			visits: 2,
			households: 1
		});
	});

	it('breaks totals down by program and ZIP', () => {
		const { db } = fixture();
		const r = buildReport(db, { from: '2026-11-01', to: '2026-11-30', programId: null });
		expect(r.by_program.map((p) => [p.name, p.visits, p.households, p.quantity])).toEqual([
			['Food Pantry', 3, 2, 63],
			['Baby Closet', 1, 1, 12]
		]);
		expect(r.by_zip).toEqual([
			{ zip: '40121', households: 1, individuals: 3, visits: 3 },
			{ zip: '40130', households: 1, individuals: 2, visits: 1 }
		]);
		expect(r.over_limit).toHaveLength(1);
		expect(r.over_limit[0]).toMatchObject({
			household_name: 'Ana Garcia',
			override_reason: 'Fire'
		});
	});

	it('filters by program and switches to monthly buckets for long ranges', () => {
		const { db, baby } = fixture();
		const r = buildReport(db, { from: '2026-01-01', to: '2026-12-31', programId: baby.id });
		expect(r.totals.visits).toBe(1);
		expect(r.granularity).toBe('month');
		expect(r.by_period).toHaveLength(12);
	});

	it('exports CSV files', () => {
		const { db } = fixture();
		const q = { from: '2026-11-01', to: '2026-11-30', programId: null };
		const summary = parseCSV(reportToCSV(buildReport(db, q), 'Test Pantry', null));
		expect(summary[0][0]).toBe('Test Pantry — service report');
		expect(summary.find((r) => r[0] === 'Households served (unduplicated)')?.[1]).toBe('2');
		const visits = parseCSV(visitsCSV(db, q));
		expect(visits).toHaveLength(5);
		expect(visits[0][0]).toBe('Date');
		const households = parseCSV(householdsCSV(db));
		expect(households).toHaveLength(3);
		expect(households[1][20]).toBe('4');
	});
});
