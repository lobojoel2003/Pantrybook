import { ApiFail, api, readJson, requireUser } from '#lib/server/api.ts';
import {
	deleteUserSessions,
	hashPassword,
	passwordProblem,
	verifyPassword
} from '#lib/server/auth.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { getUser, updateUser } from '#lib/server/users.ts';
import { changePasswordSchema } from '#lib/server/validation.ts';

/** Change your own password. Signs out your other devices. */
export const POST = api(async (event) => {
	const me = requireUser(event);
	const input = await readJson(event, changePasswordSchema);
	const db = getDb();
	const user = getUser(db, me.id);
	if (!user || !(await verifyPassword(input.current_password, user.password_hash))) {
		throw new ApiFail(400, 'Your current password is not right.');
	}
	const problem = passwordProblem(input.new_password);
	if (problem) throw new ApiFail(400, problem);
	updateUser(db, me.id, { password_hash: await hashPassword(input.new_password) });
	deleteUserSessions(db, me.id, event.locals.sessionToken ?? undefined);
	audit(db, me.id, 'password.change', 'Changed own password');
	return new Response(null, { status: 204 });
});
