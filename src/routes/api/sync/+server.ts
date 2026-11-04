import { ApiFail, api, readJson, requireUser } from '#lib/server/api.ts';
import { getDb } from '#lib/server/db.ts';
import { pullChanges, pushChanges } from '#lib/server/sync.ts';
import { pushSchema } from '#lib/server/validation.ts';

/** Download changes since a cursor: `GET /api/sync?since=123`. */
export const GET = api((event) => {
	requireUser(event);
	const raw = event.url.searchParams.get('since') ?? '0';
	const since = Number.parseInt(raw, 10);
	if (!Number.isFinite(since) || since < 0) throw new ApiFail(400, 'Invalid sync cursor.');
	return Response.json(pullChanges(getDb(), since));
});

/** Upload queued changes from a device: `POST /api/sync { mutations: [...] }`. */
export const POST = api(async (event) => {
	const user = requireUser(event);
	const { mutations } = await readJson(event, pushSchema);
	return Response.json(pushChanges(getDb(), mutations, user));
});
