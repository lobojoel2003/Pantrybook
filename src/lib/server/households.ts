import { normalizeHousehold } from '#lib/shared/household.ts';
import type { Household, HouseholdInput, ImportResult, ImportRow } from '#lib/shared/types.ts';
import { randomUUID } from 'node:crypto';
import { nextRev, nowISO, type DB } from './db.ts';

export interface HouseholdRow {
	id: string;
	number: number | null;
	first_name: string;
	last_name: string;
	phone: string;
	email: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	adults: number;
	children: number;
	seniors: number;
	language: string;
	dietary: string;
	notes: string;
	income_eligible: number;
	status: 'active' | 'inactive';
	verified_at: string;
	created_at: string;
	created_by: string | null;
	updated_at: string;
	deleted: number;
	rev: number;
}

export function toHousehold(row: HouseholdRow): Household {
	return {
		id: row.id,
		number: row.number,
		first_name: row.first_name,
		last_name: row.last_name,
		phone: row.phone,
		email: row.email,
		address: row.address,
		city: row.city,
		state: row.state,
		zip: row.zip,
		adults: row.adults,
		children: row.children,
		seniors: row.seniors,
		language: row.language,
		dietary: row.dietary,
		notes: row.notes,
		income_eligible: row.income_eligible === 1,
		status: row.status,
		verified_at: row.verified_at,
		created_at: row.created_at,
		updated_at: row.updated_at,
		deleted: row.deleted === 1,
		rev: row.rev
	};
}

export function getHousehold(db: DB, id: string): Household | null {
	const row = db.prepare(`SELECT * FROM households WHERE id = ?`).get(id) as
		HouseholdRow | undefined;
	return row ? toHousehold(row) : null;
}

export function listHouseholds(db: DB, includeDeleted = false): Household[] {
	const rows = db
		.prepare(
			`SELECT * FROM households ${includeDeleted ? '' : 'WHERE deleted = 0'}
			 ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`
		)
		.all() as HouseholdRow[];
	return rows.map(toHousehold);
}

function nextNumber(db: DB): number {
	const row = db.prepare(`SELECT COALESCE(MAX(number), 1000) + 1 AS n FROM households`).get() as {
		n: number;
	};
	return row.n;
}

/**
 * Normalise a device timestamp to UTC ISO form, and stop a device whose clock runs
 * fast from claiming its edits happened in the future.
 */
function clampTimestamp(value: string): string {
	const time = new Date(value).getTime();
	const now = Date.now();
	if (!Number.isFinite(time) || time > now + 5 * 60_000) return new Date(now).toISOString();
	return new Date(time).toISOString();
}

export type SaveOutcome =
	| { status: 'created' | 'updated'; household: Household }
	| { status: 'stale'; household: Household }
	| { status: 'deleted'; household: Household };

/**
 * Insert or update a household. Edits use last-writer-wins on the device's
 * `updated_at`, so an older offline edit never overwrites a newer one.
 */
export function saveHousehold(
	db: DB,
	data: HouseholdInput & { id: string; updated_at: string },
	userId: string | null
): SaveOutcome {
	const h = normalizeHousehold(data);
	const updatedAt = clampTimestamp(data.updated_at);
	const existing = getHousehold(db, data.id);
	if (existing?.deleted) return { status: 'deleted', household: existing };
	if (existing && existing.updated_at > updatedAt) {
		return { status: 'stale', household: existing };
	}
	const rev = nextRev(db);
	if (existing) {
		db.prepare(
			`UPDATE households SET first_name = ?, last_name = ?, phone = ?, email = ?, address = ?,
			   city = ?, state = ?, zip = ?, adults = ?, children = ?, seniors = ?, language = ?,
			   dietary = ?, notes = ?, income_eligible = ?, status = ?, verified_at = ?,
			   updated_at = ?, rev = ?
			 WHERE id = ?`
		).run(
			h.first_name,
			h.last_name,
			h.phone,
			h.email,
			h.address,
			h.city,
			h.state,
			h.zip,
			h.adults,
			h.children,
			h.seniors,
			h.language,
			h.dietary,
			h.notes,
			h.income_eligible ? 1 : 0,
			h.status,
			h.verified_at,
			updatedAt,
			rev,
			data.id
		);
		return { status: 'updated', household: getHousehold(db, data.id)! };
	}
	db.prepare(
		`INSERT INTO households (id, number, first_name, last_name, phone, email, address, city, state,
		   zip, adults, children, seniors, language, dietary, notes, income_eligible, status,
		   verified_at, created_at, created_by, updated_at, deleted, rev)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
	).run(
		data.id,
		nextNumber(db),
		h.first_name,
		h.last_name,
		h.phone,
		h.email,
		h.address,
		h.city,
		h.state,
		h.zip,
		h.adults,
		h.children,
		h.seniors,
		h.language,
		h.dietary,
		h.notes,
		h.income_eligible ? 1 : 0,
		h.status,
		h.verified_at,
		nowISO(),
		userId,
		updatedAt,
		rev
	);
	return { status: 'created', household: getHousehold(db, data.id)! };
}

/**
 * Permanently remove a household's personal details. Its visits stay so that
 * historical totals don't change, but nothing identifies the family any more.
 */
export function deleteHousehold(db: DB, id: string): Household | null {
	const existing = getHousehold(db, id);
	if (!existing) return null;
	db.transaction(() => {
		db.prepare(
			`UPDATE households SET first_name = '', last_name = 'Deleted household', phone = '',
			   email = '', address = '', city = '', state = '', language = '', dietary = '', notes = '',
			   status = 'inactive', deleted = 1, updated_at = ?, rev = ?
			 WHERE id = ?`
		).run(nowISO(), nextRev(db), id);
		// Give every touched visit its own change number so devices download the cleaned copy.
		const visits = db.prepare(`SELECT id FROM visits WHERE household_id = ?`).all(id) as {
			id: string;
		}[];
		const scrub = db.prepare(
			`UPDATE visits SET notes = '', override_reason = '', rev = ? WHERE id = ?`
		);
		for (const v of visits) scrub.run(nextRev(db), v.id);
	})();
	return getHousehold(db, id);
}

/** Keys that identify a likely duplicate: phone (last 7 digits), street + ZIP, full name. */
function duplicateKeys(
	h: Pick<HouseholdInput, 'first_name' | 'last_name' | 'phone' | 'address' | 'zip'>
) {
	const fold = (v: string) =>
		v
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
	const keys: string[] = [];
	const phone = h.phone.replace(/\D+/g, '');
	if (phone.length >= 7) keys.push(`p:${phone.slice(-7)}`);
	const address = fold(h.address).replace(/[^a-z0-9]/g, '');
	if (address.length >= 6) keys.push(`a:${address}|${h.zip.trim()}`);
	const first = fold(h.first_name.trim());
	const last = fold(h.last_name.trim());
	if (first && last) keys.push(`n:${first}|${last}`);
	return keys;
}

/**
 * Bulk-create households from a spreadsheet. `rowOffset` is the spreadsheet row number of
 * the first item, so errors point at the right row when a big file arrives in batches.
 */
export function importHouseholds(
	db: DB,
	rows: ImportRow[],
	userId: string | null,
	skipDuplicates = true,
	rowOffset = 2
): ImportResult {
	const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
	const seen = new Set<string>();
	if (skipDuplicates) {
		for (const h of listHouseholds(db)) for (const key of duplicateKeys(h)) seen.add(key);
	}
	const now = nowISO();
	db.transaction(() => {
		rows.forEach((row, index) => {
			const h = normalizeHousehold({
				...row,
				adults: row.adults ?? (row.children || row.seniors ? 0 : 1),
				children: row.children ?? 0,
				seniors: row.seniors ?? 0
			});
			if (!h.first_name && !h.last_name) {
				result.errors.push({ row: index + rowOffset, error: 'Missing name' });
				return;
			}
			if (h.adults + h.children + h.seniors === 0) h.adults = 1;
			const keys = duplicateKeys(h);
			if (skipDuplicates && keys.some((k) => seen.has(k))) {
				result.skipped += 1;
				return;
			}
			saveHousehold(db, { ...h, id: randomUUID(), updated_at: now }, userId);
			for (const key of keys) seen.add(key);
			result.imported += 1;
		});
	})();
	return result;
}
