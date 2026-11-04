import { randomUUID } from 'node:crypto';
import { emptyHousehold } from '#lib/shared/household.ts';
import type { HouseholdInput, Me, Mutation, ProgramInput } from '#lib/shared/types.ts';
import { openDatabase, type DB } from './db.ts';
import { createProgram } from './programs.ts';
import { createUser } from './users.ts';

export function testDb(): DB {
	return openDatabase(':memory:');
}

export function addUser(db: DB, role: 'admin' | 'volunteer' = 'volunteer'): Me {
	const user = createUser(db, {
		username: `${role}-${randomUUID().slice(0, 6)}`,
		display_name: role === 'admin' ? 'Coordinator' : 'Volunteer',
		role,
		password_hash: 'x'
	});
	return { id: user.id, username: user.username, display_name: user.display_name, role };
}

export function addProgram(db: DB, patch: Partial<ProgramInput> = {}) {
	return createProgram(db, {
		name: 'Food Pantry',
		unit: 'lbs',
		default_quantity: null,
		limit_count: 4,
		limit_period: 'month',
		limit_days: null,
		active: true,
		sort_order: 1,
		...patch
	});
}

export function householdMutation(
	patch: Partial<HouseholdInput> & { id?: string; updated_at?: string } = {}
): Mutation & { type: 'household.save' } {
	return {
		id: randomUUID(),
		type: 'household.save',
		at: new Date().toISOString(),
		data: {
			...emptyHousehold(),
			first_name: 'Maria',
			last_name: 'Garcia',
			zip: '40121',
			adults: 2,
			children: 2,
			id: patch.id ?? randomUUID(),
			updated_at: patch.updated_at ?? new Date().toISOString(),
			...patch
		}
	};
}

export function visitMutation(
	householdId: string,
	programId: string,
	visitDate: string,
	patch: Partial<{ id: string; quantity: number | null; override_reason: string }> = {}
): Mutation & { type: 'visit.create' } {
	return {
		id: randomUUID(),
		type: 'visit.create',
		at: new Date().toISOString(),
		data: {
			id: patch.id ?? randomUUID(),
			household_id: householdId,
			program_id: programId,
			visit_date: visitDate,
			visited_at: `${visitDate}T15:00:00.000Z`,
			quantity: patch.quantity ?? 25,
			notes: '',
			override_reason: patch.override_reason ?? ''
		}
	};
}
