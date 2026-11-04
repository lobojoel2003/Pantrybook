import { describeLimit, evaluateEligibility } from '#lib/shared/limits.ts';
import type { Visit, VisitInput } from '#lib/shared/types.ts';
import { nextRev, nowISO, type DB } from './db.ts';
import { getHousehold } from './households.ts';
import { getProgram } from './programs.ts';

/** A mutation that can never succeed, so devices should stop retrying it. */
export class PermanentError extends Error {}

export interface VisitRow {
	id: string;
	household_id: string;
	program_id: string;
	visit_date: string;
	visited_at: string;
	quantity: number | null;
	adults: number;
	children: number;
	seniors: number;
	notes: string;
	over_limit: number;
	override_reason: string;
	voided: number;
	void_reason: string;
	voided_by: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	rev: number;
}

export function toVisit(row: VisitRow): Visit {
	return {
		id: row.id,
		household_id: row.household_id,
		program_id: row.program_id,
		visit_date: row.visit_date,
		visited_at: row.visited_at,
		quantity: row.quantity,
		adults: row.adults,
		children: row.children,
		seniors: row.seniors,
		notes: row.notes,
		over_limit: row.over_limit === 1,
		override_reason: row.override_reason,
		voided: row.voided === 1,
		void_reason: row.void_reason,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
		rev: row.rev
	};
}

export function getVisit(db: DB, id: string): Visit | null {
	const row = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(id) as VisitRow | undefined;
	return row ? toVisit(row) : null;
}

export function visitsForHousehold(db: DB, householdId: string): Visit[] {
	const rows = db
		.prepare(
			`SELECT * FROM visits WHERE household_id = ? ORDER BY visit_date DESC, visited_at DESC`
		)
		.all(householdId) as VisitRow[];
	return rows.map(toVisit);
}

/**
 * Record a visit. The server re-checks the program's limit against every device's
 * visits; a visit over the limit is still saved (it already happened) but flagged.
 */
export function createVisit(
	db: DB,
	input: VisitInput,
	userId: string | null,
	weekStartsOn: 0 | 1
): { status: 'created' | 'exists'; visit: Visit; warnings: string[] } {
	const existing = getVisit(db, input.id);
	if (existing) return { status: 'exists', visit: existing, warnings: [] };

	const household = getHousehold(db, input.household_id);
	if (!household || household.deleted) throw new PermanentError('That household no longer exists.');
	const program = getProgram(db, input.program_id);
	if (!program) throw new PermanentError('That program no longer exists.');

	const earlier = (
		db
			.prepare(
				`SELECT visit_date FROM visits
				 WHERE household_id = ? AND program_id = ? AND voided = 0`
			)
			.all(input.household_id, input.program_id) as { visit_date: string }[]
	).map((r) => r.visit_date);
	const eligibility = evaluateEligibility(program, earlier, input.visit_date, weekStartsOn);
	const overLimit = !eligibility.allowed;

	const warnings: string[] = [];
	if (overLimit) {
		warnings.push(
			`Over the ${program.name} limit (${describeLimit(program).toLowerCase()}). ` +
				'The visit was saved and flagged for review.'
		);
	}

	const now = nowISO();
	db.prepare(
		`INSERT INTO visits (id, household_id, program_id, visit_date, visited_at, quantity, adults,
		   children, seniors, notes, over_limit, override_reason, voided, void_reason, created_by,
		   created_at, updated_at, rev)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?, ?)`
	).run(
		input.id,
		input.household_id,
		input.program_id,
		input.visit_date,
		new Date(input.visited_at).toISOString(),
		input.quantity,
		household.adults,
		household.children,
		household.seniors,
		input.notes.trim(),
		overLimit ? 1 : 0,
		overLimit ? input.override_reason.trim() : '',
		userId,
		now,
		now,
		nextRev(db)
	);
	return { status: 'created', visit: getVisit(db, input.id)!, warnings };
}

export function voidVisit(db: DB, id: string, reason: string, userId: string | null): Visit {
	const visit = getVisit(db, id);
	if (!visit) throw new PermanentError('That visit no longer exists.');
	if (visit.voided) return visit;
	db.prepare(
		`UPDATE visits SET voided = 1, void_reason = ?, voided_by = ?, updated_at = ?, rev = ?
		 WHERE id = ?`
	).run(reason.trim(), userId, nowISO(), nextRev(db), id);
	return getVisit(db, id)!;
}
