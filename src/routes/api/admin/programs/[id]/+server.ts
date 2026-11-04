import { ApiFail, api, readJson, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { updateProgram } from '#lib/server/programs.ts';
import { programSchema } from '#lib/server/validation.ts';

export const PUT = api(async (event) => {
	const me = requireAdmin(event);
	const input = await readJson(event, programSchema);
	const db = getDb();
	const program = updateProgram(db, event.params.id ?? '', input);
	if (!program) throw new ApiFail(404, 'Program not found.');
	audit(db, me.id, 'program.update', program.name);
	return Response.json({ program });
});
