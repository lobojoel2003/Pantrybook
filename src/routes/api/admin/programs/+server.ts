import { api, readJson, requireAdmin } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { createProgram, listPrograms } from '#lib/server/programs.ts';
import { programSchema } from '#lib/server/validation.ts';

export const GET = api((event) => {
	requireAdmin(event);
	return Response.json({ programs: listPrograms(getDb()) });
});

export const POST = api(async (event) => {
	const me = requireAdmin(event);
	const input = await readJson(event, programSchema);
	const db = getDb();
	const program = createProgram(db, input);
	audit(db, me.id, 'program.create', program.name);
	return Response.json({ program }, { status: 201 });
});
