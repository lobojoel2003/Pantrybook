import { ApiFail, api, requireUser } from '#lib/server/api.ts';
import { getDb } from '#lib/server/db.ts';
import { getHousehold } from '#lib/server/households.ts';
import { visitsForHousehold } from '#lib/server/visits.ts';

/** A household's complete visit history (devices only keep recent visits offline). */
export const GET = api((event) => {
	requireUser(event);
	const db = getDb();
	const id = event.params.id ?? '';
	if (!getHousehold(db, id)) throw new ApiFail(404, 'Household not found.');
	return Response.json({ visits: visitsForHousehold(db, id) });
});
