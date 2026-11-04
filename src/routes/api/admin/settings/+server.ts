import { api, readJson, requireAdmin, requireUser } from '#lib/server/api.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { getSettings, saveSettings } from '#lib/server/settings.ts';
import { settingsSchema } from '#lib/server/validation.ts';

export const GET = api((event) => {
	requireUser(event);
	return Response.json({ settings: getSettings(getDb()) });
});

export const PUT = api(async (event) => {
	const me = requireAdmin(event);
	const input = await readJson(event, settingsSchema);
	const db = getDb();
	const settings = saveSettings(db, input);
	audit(db, me.id, 'settings.update', 'Updated organization settings');
	return Response.json({ settings });
});
