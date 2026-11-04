import { getDb } from '#lib/server/db.ts';
import { BUILD } from '#lib/shared/build.ts';
import type { RequestHandler } from '@sveltejs/kit';

const startedAt = Date.now();

/** Liveness and version check for load balancers, uptime monitors and the About screen. */
export const GET: RequestHandler = () => {
	let database = 'ok';
	try {
		getDb().prepare('SELECT 1').get();
	} catch {
		database = 'error';
	}
	return Response.json(
		{
			status: database === 'ok' ? 'ok' : 'degraded',
			database,
			...BUILD,
			uptime_seconds: Math.round((Date.now() - startedAt) / 1000)
		},
		{ status: database === 'ok' ? 200 : 503 }
	);
};
