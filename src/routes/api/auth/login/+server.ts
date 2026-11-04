import { ApiFail, api, readJson } from '#lib/server/api.ts';
import {
	clearLoginFailures,
	createSession,
	getDummyHash,
	loginRetryAfter,
	recordLoginFailure,
	verifyPassword
} from '#lib/server/auth.ts';
import { setSessionCookie } from '#lib/server/cookies.ts';
import { getDb } from '#lib/server/db.ts';
import { findUserByUsername } from '#lib/server/users.ts';
import { loginSchema } from '#lib/server/validation.ts';

export const POST = api(async (event) => {
	const { username, password } = await readJson(event, loginSchema);
	const key = `${event.getClientAddress()}|${username.toLowerCase()}`;
	const wait = loginRetryAfter(key);
	if (wait > 0) {
		throw new ApiFail(
			429,
			`Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
			undefined,
			{ 'Retry-After': String(wait) }
		);
	}

	const db = getDb();
	const user = findUserByUsername(db, username);
	const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
	if (!user || !ok || !user.active) {
		recordLoginFailure(key);
		throw new ApiFail(
			401,
			user && ok && !user.active
				? 'This account has been turned off. Ask a coordinator for help.'
				: 'That username and password do not match.'
		);
	}
	clearLoginFailures(key);

	const session = createSession(db, user.id, event.request.headers.get('user-agent') ?? '');
	setSessionCookie(event, session.token, session.expires);
	return Response.json({
		user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
	});
});
