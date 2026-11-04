import { ApiFail, api, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { deleteHousehold, getHousehold } from '#lib/server/households.ts';

/** Erase a household's personal details (for example, at the family's request). */
export const DELETE = api((event) => {
	const me = requireAdmin(event);
	const db = getDb();
	const id = event.params.id ?? '';
	const before = getHousehold(db, id);
	if (!before || before.deleted) throw new ApiFail(404, 'Household not found.');
	const household = deleteHousehold(db, id);
	// Log only the number: the point of deleting is to forget who they were.
	audit(db, me.id, 'household.delete', `Deleted household #${before.number ?? '?'}`);
	return Response.json({ household });
});
