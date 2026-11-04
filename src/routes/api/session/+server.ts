import { api } from '#lib/server/api.ts';
import { config } from '#lib/server/config.ts';
import { getDb } from '#lib/server/db.ts';
import { getSettings } from '#lib/server/settings.ts';
import { countUsers } from '#lib/server/users.ts';
import type { SessionInfo } from '#lib/shared/types.ts';

export const GET = api((event) => {
	const db = getDb();
	const info: SessionInfo = {
		setup_required: countUsers(db) === 0,
		demo: config.demo,
		user: event.locals.user,
		org_name: getSettings(db).org_name
	};
	return Response.json(info);
});
