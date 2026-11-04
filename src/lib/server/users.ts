import { randomUUID } from 'node:crypto';
import type { PublicUser, Role, UserName } from '#lib/shared/types.ts';
import { nextRev, nowISO, type DB } from './db.ts';

interface UserRow {
	id: string;
	username: string;
	display_name: string;
	password_hash: string;
	role: Role;
	active: number;
	created_at: string;
	updated_at: string;
	last_login_at: string | null;
}

export interface UserWithHash extends PublicUser {
	password_hash: string;
}

function toUser(row: UserRow): UserWithHash {
	return {
		id: row.id,
		username: row.username,
		display_name: row.display_name,
		role: row.role,
		active: row.active === 1,
		created_at: row.created_at,
		last_login_at: row.last_login_at,
		password_hash: row.password_hash
	};
}

export function publicUser(user: UserWithHash): PublicUser {
	const { password_hash: _ignored, ...rest } = user;
	void _ignored;
	return rest;
}

export function countUsers(db: DB): number {
	return (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
}

export function countActiveAdmins(db: DB, exceptId?: string): number {
	return (
		db
			.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?`)
			.get(exceptId ?? '') as { n: number }
	).n;
}

export function getUser(db: DB, id: string): UserWithHash | null {
	const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
	return row ? toUser(row) : null;
}

export function findUserByUsername(db: DB, username: string): UserWithHash | null {
	const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username.trim()) as
		UserRow | undefined;
	return row ? toUser(row) : null;
}

export function listUsers(db: DB): PublicUser[] {
	const rows = db
		.prepare(`SELECT * FROM users ORDER BY active DESC, display_name COLLATE NOCASE`)
		.all() as UserRow[];
	return rows.map((r) => publicUser(toUser(r)));
}

export function userNames(db: DB): UserName[] {
	return db.prepare(`SELECT id, display_name FROM users ORDER BY display_name`).all() as UserName[];
}

export function createUser(
	db: DB,
	input: { username: string; display_name: string; role: Role; password_hash: string }
): PublicUser {
	const id = randomUUID();
	const now = nowISO();
	db.prepare(
		`INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
	).run(
		id,
		input.username.trim(),
		input.display_name.trim(),
		input.password_hash,
		input.role,
		now,
		now
	);
	nextRev(db);
	return publicUser(getUser(db, id)!);
}

export function updateUser(
	db: DB,
	id: string,
	patch: { display_name?: string; role?: Role; active?: boolean; password_hash?: string }
): PublicUser | null {
	const current = getUser(db, id);
	if (!current) return null;
	db.prepare(
		`UPDATE users SET display_name = ?, role = ?, active = ?, password_hash = ?, updated_at = ?
		 WHERE id = ?`
	).run(
		patch.display_name?.trim() ?? current.display_name,
		patch.role ?? current.role,
		(patch.active ?? current.active) ? 1 : 0,
		patch.password_hash ?? current.password_hash,
		nowISO(),
		id
	);
	nextRev(db);
	return publicUser(getUser(db, id)!);
}
