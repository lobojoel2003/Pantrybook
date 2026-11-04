import { api, requireUser } from '#lib/server/api.ts';
import { getDb } from '#lib/server/db.ts';
import { buildReport } from '#lib/server/reports.ts';
import { reportQuery } from './query.ts';

export const GET = api((event) => {
	requireUser(event);
	const db = getDb();
	return Response.json(buildReport(db, reportQuery(db, event.url)));
});
