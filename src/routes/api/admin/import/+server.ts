import { api, readJson, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { importHouseholds } from '#lib/server/households.ts';
import { importSchema } from '#lib/server/validation.ts';

/** Bulk-create households from rows the browser parsed out of a spreadsheet. */
export const POST = api(async (event) => {
	const me = requireAdmin(event);
	const { rows, skip_duplicates, row_offset } = await readJson(event, importSchema);
	const db = getDb();
	const result = importHouseholds(db, rows, me.id, skip_duplicates, row_offset);
	audit(
		db,
		me.id,
		'households.import',
		`Imported ${result.imported}, skipped ${result.skipped}, errors ${result.errors.length}`
	);
	return Response.json(result);
});
