import { ApiFail, api, readJson, requireAdmin } from '#lib/server/api.ts';
import { deleteUserSessions, hashPassword, passwordProblem } from '#lib/server/auth.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { countActiveAdmins, getUser, updateUser } from '#lib/server/users.ts';
import { updateUserSchema } from '#lib/server/validation.ts';

export const PATCH = api(async (event) => {
	const me = requireAdmin(event);
	const input = await readJson(event, updateUserSchema);
	const db = getDb();
	const id = event.params.id ?? '';
	const target = getUser(db, id);
	if (!target) throw new ApiFail(404, 'User not found.');

	const losingAdmin =
		target.role === 'admin' &&
		target.active &&
		(input.role === 'volunteer' || input.active === false);
	if (losingAdmin && countActiveAdmins(db, id) === 0) {
		throw new ApiFail(400, 'Pantrybook needs at least one active coordinator (admin).');
	}

	let password_hash: string | undefined;
	if (input.password) {
		const problem = passwordProblem(input.password);
		if (problem) throw new ApiFail(400, problem);
		password_hash = await hashPassword(input.password);
	}
	const user = updateUser(db, id, {
		display_name: input.display_name,
		role: input.role,
		active: input.active,
		password_hash
	});
	if (password_hash || input.active === false) {
		deleteUserSessions(db, id, id === me.id ? (event.locals.sessionToken ?? undefined) : undefined);
	}
	const changes = [
		input.display_name !== undefined && 'name',
		input.role !== undefined && `role=${input.role}`,
		input.active !== undefined && (input.active ? 'activated' : 'deactivated'),
		password_hash && 'password reset'
	].filter(Boolean);
	audit(db, me.id, 'user.update', `${target.username}: ${changes.join(', ')}`);
	return Response.json({ user });
});
