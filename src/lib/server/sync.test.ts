import { describe, expect, it } from 'vitest';
import { localISODate } from '#lib/shared/dates.ts';
import Database from 'better-sqlite3';
import { backupBytes, currentRev, migrate, rotateServerId, serverId } from './db.ts';
import { deleteHousehold, importHouseholds } from './households.ts';
import { pullChanges, pushChanges } from './sync.ts';
import { addProgram, addUser, householdMutation, testDb, visitMutation } from './test-helpers.ts';

describe('migrations', () => {
	it('are idempotent', () => {
		const db = testDb();
		migrate(db);
		expect(db.pragma('user_version', { simple: true })).toBeGreaterThan(0);
	});
});

describe('sync push', () => {
	it('creates a household and assigns a number', () => {
		const db = testDb();
		const user = addUser(db);
		const m = householdMutation();
		const { results } = pushChanges(db, [m], user);
		expect(results[0].ok).toBe(true);
		expect(results[0].household?.number).toBe(1001);
		const second = pushChanges(db, [householdMutation({ first_name: 'Ana' })], user);
		expect(second.results[0].household?.number).toBe(1002);
	});

	it('is idempotent when a device retries', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db);
		const h = householdMutation();
		const v = visitMutation(h.data.id, program.id, localISODate());
		pushChanges(db, [h, v], user);
		const again = pushChanges(db, [h, v], user);
		expect(again.results.every((r) => r.ok)).toBe(true);
		const count = db.prepare('SELECT COUNT(*) AS n FROM visits').get() as { n: number };
		expect(count.n).toBe(1);
	});

	it('keeps the newer edit when an older offline edit arrives late', () => {
		const db = testDb();
		const user = addUser(db);
		const id = crypto.randomUUID();
		pushChanges(
			db,
			[householdMutation({ id, phone: '111', updated_at: '2026-11-04T10:00:00Z' })],
			user
		);
		pushChanges(
			db,
			[householdMutation({ id, phone: '333', updated_at: '2026-11-04T12:00:00Z' })],
			user
		);
		const late = pushChanges(
			db,
			[householdMutation({ id, phone: '222', updated_at: '2026-11-04T11:00:00Z' })],
			user
		);
		expect(late.results[0].ok).toBe(true);
		expect(late.results[0].warnings?.[0]).toMatch(/newer details/);
		expect(late.results[0].household?.phone).toBe('333');
	});

	it('records visits over the limit but flags them', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db, { limit_count: 2, limit_period: 'month' });
		const h = householdMutation();
		pushChanges(db, [h], user);
		const visits = ['2026-11-02', '2026-11-09', '2026-11-16'].map((d) =>
			visitMutation(h.data.id, program.id, d, { override_reason: 'Emergency' })
		);
		const { results } = pushChanges(db, visits, user);
		expect(results.map((r) => r.visit?.over_limit)).toEqual([false, false, true]);
		expect(results[2].warnings?.[0]).toMatch(/Over the Food Pantry limit/);
		expect(results[2].visit?.override_reason).toBe('Emergency');
		// Size is snapshotted from the household for reporting.
		expect(results[0].visit).toMatchObject({ adults: 2, children: 2, seniors: 0 });
	});

	it('does not count voided visits toward the limit', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db, { limit_count: 1, limit_period: 'month' });
		const h = householdMutation();
		const first = visitMutation(h.data.id, program.id, '2026-11-02');
		pushChanges(db, [h, first], user);
		pushChanges(
			db,
			[
				{ id: 'void-1', type: 'visit.void', at: '', data: { id: first.data.id, reason: 'Mistake' } }
			],
			user
		);
		const second = pushChanges(db, [visitMutation(h.data.id, program.id, '2026-11-03')], user);
		expect(second.results[0].visit?.over_limit).toBe(false);
	});

	it('rejects bad changes permanently without blocking good ones', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db);
		const good = householdMutation();
		const { results } = pushChanges(
			db,
			[
				{ nonsense: true },
				visitMutation(crypto.randomUUID(), program.id, '2026-11-04'),
				householdMutation({ adults: 500 }),
				good
			],
			user
		);
		expect(results.map((r) => [r.ok, r.permanent ?? false])).toEqual([
			[false, true],
			[false, true],
			[false, true],
			[true, false]
		]);
		expect(results[1].error).toMatch(/household no longer exists/);
	});

	it('refuses edits to deleted households and returns the tombstone', () => {
		const db = testDb();
		const user = addUser(db);
		const h = householdMutation();
		pushChanges(db, [h], user);
		deleteHousehold(db, h.data.id);
		const { results } = pushChanges(db, [householdMutation({ id: h.data.id, phone: '123' })], user);
		expect(results[0]).toMatchObject({ ok: false, permanent: true });
		expect(results[0].household?.deleted).toBe(true);
		expect(results[0].household?.last_name).toBe('Deleted household');
	});
});

describe('sync pull', () => {
	it('returns only changes after the cursor', () => {
		const db = testDb();
		const user = addUser(db);
		addProgram(db);
		pushChanges(db, [householdMutation()], user);
		const first = pullChanges(db, 0);
		expect(first.households).toHaveLength(1);
		expect(first.programs).toHaveLength(1);
		expect(first.more).toBe(false);
		expect(first.rev).toBe(currentRev(db));
		expect(first.users.length).toBe(1);

		const nothing = pullChanges(db, first.rev);
		expect(nothing.households).toHaveLength(0);

		pushChanges(db, [householdMutation({ first_name: 'Ana' })], user);
		const next = pullChanges(db, first.rev);
		expect(next.households.map((h) => h.first_name)).toEqual(['Ana']);
	});

	it('pages through large change sets without losing rows', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db);
		const today = localISODate();
		const mutations = [];
		for (let i = 0; i < 25; i++) {
			const h = householdMutation({ first_name: `P${i}` });
			mutations.push(h, visitMutation(h.data.id, program.id, today));
		}
		pushChanges(db, mutations, user);
		const households = new Set<string>();
		const visits = new Set<string>();
		let since = 0;
		for (let page = 0; page < 20; page++) {
			const res = pullChanges(db, since, 7);
			res.households.forEach((h) => households.add(h.id));
			res.visits.forEach((v) => visits.add(v.id));
			since = res.rev;
			if (!res.more) break;
		}
		expect(households.size).toBe(25);
		expect(visits.size).toBe(25);
	});

	it('sends tombstones incrementally but not on a fresh download', () => {
		const db = testDb();
		const user = addUser(db);
		const h = householdMutation();
		pushChanges(db, [h], user);
		const cursor = pullChanges(db, 0).rev;
		deleteHousehold(db, h.data.id);
		expect(pullChanges(db, cursor).households[0].deleted).toBe(true);
		expect(pullChanges(db, 0).households).toHaveLength(0);
	});

	it('sends scrubbed visits after a household is deleted', () => {
		const db = testDb();
		const user = addUser(db);
		const program = addProgram(db, { limit_count: null, limit_period: null });
		const h = householdMutation();
		const visits = [1, 2, 3].map((d) => {
			const v = visitMutation(h.data.id, program.id, `2026-11-0${d}`);
			v.data.notes = 'Proxy pickup: neighbor';
			v.data.visit_date = localISODate();
			return v;
		});
		pushChanges(db, [h, ...visits], user);
		const cursor = pullChanges(db, 0).rev;
		deleteHousehold(db, h.data.id);
		const after = pullChanges(db, cursor, 2);
		// Unique change numbers mean paging still delivers every scrubbed visit.
		const all = [...after.visits, ...pullChanges(db, after.rev).visits];
		expect(all).toHaveLength(3);
		expect(all.every((v) => v.notes === '')).toBe(true);
	});

	it('gives backups their own identity', () => {
		const db = testDb();
		const user = addUser(db);
		pushChanges(db, [householdMutation()], user);
		const copy = new Database(backupBytes(db));
		expect(serverId(copy)).not.toBe(serverId(db));
		expect((copy.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number }).n).toBe(1);
	});

	it('changes identity when the server id rotates', () => {
		const db = testDb();
		const before = serverId(db);
		rotateServerId(db);
		expect(pullChanges(db, 0).server_id).not.toBe(before);
	});
});

describe('import', () => {
	it('imports rows, skipping duplicates and nameless rows', () => {
		const db = testDb();
		const user = addUser(db, 'admin');
		const result = importHouseholds(
			db,
			[
				{ first_name: 'Ana', last_name: 'Diaz', phone: '555-201-1111' },
				{ first_name: 'ana', last_name: 'diaz' },
				{ first_name: '', last_name: '' },
				{ first_name: 'Li', last_name: 'Wei', children: 3 }
			],
			user.id
		);
		expect(result).toEqual({
			imported: 2,
			skipped: 1,
			errors: [{ row: 4, error: 'Missing name' }]
		});
		const li = db.prepare(`SELECT adults, children FROM households WHERE last_name = 'Wei'`).get();
		expect(li).toEqual({ adults: 0, children: 3 });

		// Duplicates by phone (last 7 digits) or street + ZIP are skipped too, also within a file.
		const again = importHouseholds(
			db,
			[
				{ first_name: 'A', last_name: 'B', phone: '+1 (555) 201-1111' },
				{ first_name: 'C', last_name: 'D', address: '12 Oak Street', zip: '40121' },
				{ first_name: 'E', last_name: 'F', address: '12 oak street', zip: '40121' }
			],
			user.id,
			true,
			10
		);
		expect(again).toEqual({ imported: 1, skipped: 2, errors: [] });
	});
});
