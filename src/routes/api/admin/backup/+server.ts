import { api, requireAdmin } from '#lib/server/api.ts';
import { audit, backupBytes, getDb } from '#lib/server/db.ts';

/** Download a consistent copy of the whole SQLite database. */
export const GET = api((event) => {
	const me = requireAdmin(event);
	const db = getDb();
	audit(db, me.id, 'backup.download', 'Downloaded a database backup');
	const file = backupBytes(db);
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'application/vnd.sqlite3',
			'Content-Disposition': `attachment; filename="pantrybook-backup-${stamp}.db"`,
			'Content-Length': String(file.length)
		}
	});
});
