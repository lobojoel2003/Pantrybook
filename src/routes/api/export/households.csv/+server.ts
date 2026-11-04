import { api, csvResponse, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { householdsCSV } from '#lib/server/reports.ts';
import { localISODate } from '#lib/shared/dates.ts';

export const GET = api((event) => {
	const me = requireAdmin(event);
	const db = getDb();
	audit(db, me.id, 'export.households', 'Downloaded households CSV');
	return csvResponse(householdsCSV(db), `pantrybook-households-${localISODate()}.csv`);
});
