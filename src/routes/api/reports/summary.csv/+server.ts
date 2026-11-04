import { api, csvResponse, requireUser } from '#lib/server/api.ts';
import { getDb } from '#lib/server/db.ts';
import { buildReport, reportToCSV } from '#lib/server/reports.ts';
import { getSettings } from '#lib/server/settings.ts';
import { reportQuery } from '../query.ts';

export const GET = api((event) => {
	requireUser(event);
	const db = getDb();
	const q = reportQuery(db, event.url);
	const csv = reportToCSV(buildReport(db, q), getSettings(db).org_name, q.programName);
	return csvResponse(csv, `pantrybook-report-${q.from}-to-${q.to}.csv`);
});
