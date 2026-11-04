import { ApiFail, api, readJson, requireAdmin } from '#lib/server/api.ts';
import { hashPassword, passwordProblem } from '#lib/server/auth.ts';
import { audit, getDb } from '#lib/server/db.ts';
import { createUser, findUserByUsername, listUsers } from '#lib/server/users.ts';
import { createUserSchema } from '#lib/server/validation.ts';

export const GET = api((event) => {
	requireAdmin(event);
	return Response.json({ users: listUsers(getDb()) });
});

export const POST = api(async (event) => {
	const me = requireAdmin(event);
	const input = await readJson(event, createUserSchema);
	const db = getDb();
	if (findUserByUsername(db, input.username)) {
		throw new ApiFail(409, `The username "${input.username}" is already taken.`);
	}
	const problem = passwordProblem(input.password);
	if (problem) throw new ApiFail(400, problem);
	const user = createUser(db, {
		username: input.username,
		display_name: input.display_name,
		role: input.role,
		password_hash: await hashPassword(input.password)
	});
	audit(db, me.id, 'user.create', `${user.username} (${user.role})`);
	return Response.json({ user }, { status: 201 });
});
