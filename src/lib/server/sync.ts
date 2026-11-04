import { addDays, localISODate } from '#lib/shared/dates.ts';
import type { Me, MutationResult, SyncPullResponse, SyncPushResponse } from '#lib/shared/types.ts';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { currentRev, serverId, type DB } from './db.ts';
import { saveHousehold, toHousehold, type HouseholdRow } from './households.ts';
import { toProgram } from './programs.ts';
import { getSettings } from './settings.ts';
import { userNames } from './users.ts';
import {
	householdSaveSchema,
	issuesOf,
	mutationSchema,
	visitCreateSchema,
	visitVoidSchema
} from './validation.ts';
import { createVisit, PermanentError, toVisit, voidVisit, type VisitRow } from './visits.ts';

export const PULL_PAGE_SIZE = 1000;

/**
 * Everything that changed after `since`. Devices call this repeatedly, sending
 * back the returned `rev`, until `more` is false.
 */
export function pullChanges(db: DB, since: number, limit = PULL_PAGE_SIZE): SyncPullResponse {
	return db.transaction(() => {
		const latest = currentRev(db);
		const windowStart = addDays(localISODate(), -config.offlineVisitDays);

		const householdRows = db
			.prepare(
				`SELECT * FROM households WHERE rev > ? ${since === 0 ? 'AND deleted = 0' : ''}
				 ORDER BY rev LIMIT ?`
			)
			.all(since, limit) as HouseholdRow[];
		const visitRows = db
			.prepare(`SELECT * FROM visits WHERE rev > ? AND visit_date >= ? ORDER BY rev LIMIT ?`)
			.all(since, windowStart, limit) as VisitRow[];
		const programRows = db
			.prepare(`SELECT * FROM programs WHERE rev > ? ORDER BY rev`)
			.all(since) as Parameters<typeof toProgram>[0][];

		let next = latest;
		let more = false;
		if (householdRows.length === limit) {
			next = Math.min(next, householdRows[householdRows.length - 1].rev);
			more = true;
		}
		if (visitRows.length === limit) {
			next = Math.min(next, visitRows[visitRows.length - 1].rev);
			more = true;
		}

		return {
			server_id: serverId(db),
			rev: next,
			more,
			households: householdRows.filter((r) => r.rev <= next).map(toHousehold),
			visits: visitRows.filter((r) => r.rev <= next).map(toVisit),
			programs: programRows.filter((r) => r.rev <= next).map(toProgram),
			settings: getSettings(db),
			users: userNames(db),
			visit_window_start: windowStart
		};
	})();
}

function applyOne(db: DB, raw: unknown, user: Me): MutationResult {
	const id =
		typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
			? (raw as { id: string }).id
			: 'unknown';
	const parsed = mutationSchema.safeParse(raw);
	if (!parsed.success) {
		return { id, ok: false, permanent: true, error: 'This change could not be read.' };
	}
	const mutation = parsed.data;
	const { week_starts_on } = getSettings(db);
	try {
		return db.transaction((): MutationResult => {
			switch (mutation.type) {
				case 'household.save': {
					const data = householdSaveSchema.parse(mutation.data);
					const outcome = saveHousehold(db, data, user.id);
					if (outcome.status === 'deleted') {
						return {
							id,
							ok: false,
							permanent: true,
							error: 'This household was deleted by a coordinator.',
							household: outcome.household
						};
					}
					return {
						id,
						ok: true,
						household: outcome.household,
						warnings:
							outcome.status === 'stale'
								? ['Someone saved newer details for this household, so those were kept.']
								: []
					};
				}
				case 'visit.create': {
					const data = visitCreateSchema.parse(mutation.data);
					const outcome = createVisit(db, data, user.id, week_starts_on);
					return { id, ok: true, visit: outcome.visit, warnings: outcome.warnings };
				}
				case 'visit.void': {
					const data = visitVoidSchema.parse(mutation.data);
					const visit = voidVisit(db, data.id, data.reason, user.id);
					return { id, ok: true, visit };
				}
			}
		})();
	} catch (err) {
		if (err instanceof PermanentError)
			return { id, ok: false, permanent: true, error: err.message };
		if (err instanceof ZodError) {
			return { id, ok: false, permanent: true, error: issuesOf(err).join(' ') };
		}
		console.error('[sync] failed to apply change', id, err);
		return { id, ok: false, permanent: false, error: 'The server could not save this change yet.' };
	}
}

/** Apply a device's queued changes in order. Each change succeeds or fails on its own. */
export function pushChanges(db: DB, mutations: unknown[], user: Me): SyncPushResponse {
	return { results: mutations.map((m) => applyOne(db, m, user)) };
}
