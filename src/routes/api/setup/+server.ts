import { ApiFail, api, readJson } from '#lib/server/api.ts';
import { createSession, hashPassword, passwordProblem } from '#lib/server/auth.ts';
import { setSessionCookie } from '#lib/server/cookies.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { seedDefaultPrograms } from '#lib/server/programs.ts';
import { saveSettings } from '#lib/server/settings.ts';
import { countUsers, createUser } from '#lib/server/users.ts';
import { setupSchema } from '#lib/server/validation.ts';

/** First-run setup: name the organization and create the first coordinator account. */
export const POST = api(async (event) => {
	const db = getDb();
	if (countUsers(db) > 0) throw new ApiFail(409, 'Pantrybook is already set up. Please sign in.');
	const input = await readJson(event, setupSchema);
	const problem = passwordProblem(input.password);
	if (problem) throw new ApiFail(400, problem);
	const passwordHash = await hashPassword(input.password);

	// Re-check after the slow hash in case two people submit setup at once.
	if (countUsers(db) > 0) throw new ApiFail(409, 'Pantrybook is already set up. Please sign in.');
	const user = db.transaction(() => {
		saveSettings(db, { org_name: input.org_name });
		seedDefaultPrograms(db);
		const created = createUser(db, {
			username: input.username,
			display_name: input.display_name,
			role: 'admin',
			password_hash: passwordHash
		});
		audit(db, created.id, 'setup', `Created organization "${input.org_name}"`);
		return created;
	})();

	const session = createSession(db, user.id, event.request.headers.get('user-agent') ?? '');
	setSessionCookie(event, session.token, session.expires);
	return Response.json(
		{
			user: {
				id: user.id,
				username: user.username,
				display_name: user.display_name,
				role: user.role
			}
		},
		{ status: 201 }
	);
});
