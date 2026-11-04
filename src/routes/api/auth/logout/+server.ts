import { api } from '#lib/server/api.ts';
import { deleteSession } from '#lib/server/auth.ts';
import { clearSessionCookie } from '#lib/server/cookies.ts';
import { getDb } from '#lib/server/db.ts';

export const POST = api((event) => {
	if (event.locals.sessionToken) deleteSession(getDb(), event.locals.sessionToken);
	clearSessionCookie(event);
	return new Response(null, { status: 204 });
});
