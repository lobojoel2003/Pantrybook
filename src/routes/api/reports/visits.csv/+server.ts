import { api, csvResponse, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { visitsCSV } from '#lib/server/reports.ts';
import { reportQuery } from '../query.ts';

/** Every visit with names and notes, so coordinators only, and logged. */
export const GET = api((event) => {
	const me = requireAdmin(event);
	const db = getDb();
	const q = reportQuery(db, event.url);
	audit(db, me.id, 'export.visits', `Downloaded visits CSV ${q.from} to ${q.to}`);
	return csvResponse(visitsCSV(db, q), `pantrybook-visits-${q.from}-to-${q.to}.csv`);
});
