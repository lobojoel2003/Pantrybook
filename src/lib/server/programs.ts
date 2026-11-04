import { randomUUID } from 'node:crypto';
import type { LimitPeriod, Program, ProgramInput } from '#lib/shared/types.ts';
import { nextRev, nowISO, type DB } from './db.ts';

interface ProgramRow {
	id: string;
	name: string;
	unit: string;
	default_quantity: number | null;
	limit_count: number | null;
	limit_period: LimitPeriod | null;
	limit_days: number | null;
	active: number;
	sort_order: number;
	created_at: string;
	updated_at: string;
	rev: number;
}

export function toProgram(row: ProgramRow): Program {
	return {
		id: row.id,
		name: row.name,
		unit: row.unit,
		default_quantity: row.default_quantity,
		limit_count: row.limit_count,
		limit_period: row.limit_period,
		limit_days: row.limit_period === 'rolling' ? row.limit_days : null,
		active: row.active === 1,
		sort_order: row.sort_order,
		updated_at: row.updated_at,
		rev: row.rev
	};
}

export function listPrograms(db: DB): Program[] {
	const rows = db
		.prepare(`SELECT * FROM programs ORDER BY sort_order, name COLLATE NOCASE`)
		.all() as ProgramRow[];
	return rows.map(toProgram);
}

export function getProgram(db: DB, id: string): Program | null {
	const row = db.prepare(`SELECT * FROM programs WHERE id = ?`).get(id) as ProgramRow | undefined;
	return row ? toProgram(row) : null;
}

function clean(input: ProgramInput): ProgramInput {
	const limited = input.limit_count !== null && input.limit_period !== null;
	return {
		...input,
		name: input.name.trim(),
		unit: input.unit.trim(),
		limit_count: limited ? input.limit_count : null,
		limit_period: limited ? input.limit_period : null,
		limit_days: limited && input.limit_period === 'rolling' ? input.limit_days : null
	};
}

export function createProgram(db: DB, input: ProgramInput, id: string = randomUUID()): Program {
	const p = clean(input);
	const now = nowISO();
	db.prepare(
		`INSERT INTO programs (id, name, unit, default_quantity, limit_count, limit_period, limit_days,
		   active, sort_order, created_at, updated_at, rev)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		p.name,
		p.unit,
		p.default_quantity,
		p.limit_count,
		p.limit_period,
		p.limit_days,
		p.active ? 1 : 0,
		p.sort_order,
		now,
		now,
		nextRev(db)
	);
	return getProgram(db, id)!;
}

export function updateProgram(db: DB, id: string, input: ProgramInput): Program | null {
	if (!getProgram(db, id)) return null;
	const p = clean(input);
	db.prepare(
		`UPDATE programs SET name = ?, unit = ?, default_quantity = ?, limit_count = ?, limit_period = ?,
		   limit_days = ?, active = ?, sort_order = ?, updated_at = ?, rev = ?
		 WHERE id = ?`
	).run(
		p.name,
		p.unit,
		p.default_quantity,
		p.limit_count,
		p.limit_period,
		p.limit_days,
		p.active ? 1 : 0,
		p.sort_order,
		nowISO(),
		nextRev(db),
		id
	);
	return getProgram(db, id);
}

/** Programs most pantries start with. Admins can rename or turn them off. */
export function seedDefaultPrograms(db: DB): void {
	const existing = (db.prepare(`SELECT COUNT(*) AS n FROM programs`).get() as { n: number }).n;
	if (existing > 0) return;
	createProgram(db, {
		name: 'Food Pantry',
		unit: 'lbs',
		default_quantity: null,
		limit_count: 4,
		limit_period: 'month',
		limit_days: null,
		active: true,
		sort_order: 1
	});
}
