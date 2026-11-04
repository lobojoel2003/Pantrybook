import { api, requireAdmin } from '#lib/server/api.ts';
import { getDb } from '#lib/server/db.ts';

export const GET = api((event) => {
	requireAdmin(event);
	const rows = getDb()
		.prepare(
			`SELECT a.id, a.at, a.action, a.detail, COALESCE(u.display_name, '') AS user_name
			 FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
			 ORDER BY a.id DESC LIMIT 200`
		)
		.all();
	return Response.json({ activity: rows });
});
