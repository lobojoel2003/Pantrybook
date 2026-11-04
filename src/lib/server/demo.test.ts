import { describe, expect, it } from 'vitest';
import { serverId } from './db.ts';
import { seedDemo } from './demo.ts';
import { buildReport } from './reports.ts';
import { testDb } from './test-helpers.ts';
import { countUsers } from './users.ts';
import { addDays, localISODate } from '#lib/shared/dates.ts';

describe('demo data', () => {
	it('seeds a realistic pantry and can reset it', async () => {
		const db = testDb();
		const first = await seedDemo(db, { households: 40, days: 60 });
		expect(first.households).toBe(40);
		expect(first.visits).toBeGreaterThan(40);
		expect(countUsers(db)).toBe(2);
		const id = serverId(db);

		const second = await seedDemo(db, { households: 40, days: 60 });
		expect(second).toEqual(first);
		expect(serverId(db)).not.toBe(id);

		const report = buildReport(db, {
			from: addDays(localISODate(), -60),
			to: localISODate(),
			programId: null
		});
		expect(report.totals.households).toBeGreaterThan(10);
		expect(report.by_program.length).toBeGreaterThan(0);
	});
});
