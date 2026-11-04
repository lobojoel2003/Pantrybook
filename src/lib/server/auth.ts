import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.ts';
import { nowISO, type DB } from './db.ts';
import type { Me, Role } from '#lib/shared/types.ts';

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

export const SESSION_COOKIE = 'pantrybook_session';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 };
const MAXMEM = 128 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function passwordProblem(password: string): string | null {
	if (password.length < PASSWORD_MIN)
		return `Use at least ${PASSWORD_MIN} characters for the password.`;
	if (password.length > PASSWORD_MAX) return 'That password is too long.';
	return null;
}

/** Hash a password as `scrypt$N$r$p$salt$hash` (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
		N: SCRYPT.N,
		r: SCRYPT.r,
		p: SCRYPT.p,
		maxmem: MAXMEM
	});
	return [
		'scrypt',
		SCRYPT.N,
		SCRYPT.r,
		SCRYPT.p,
		salt.toString('base64url'),
		hash.toString('base64url')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const [, n, r, p, saltText, hashText] = parts;
	const expected = Buffer.from(hashText, 'base64url');
	try {
		const actual = await scryptAsync(
			password.normalize('NFKC'),
			Buffer.from(saltText, 'base64url'),
			expected.length,
			{ N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM }
		);
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

/** A hash that never matches, used to keep login timing the same for unknown usernames. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
	dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
	return dummyHash;
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSession(
	db: DB,
	userId: string,
	userAgent = ''
): { token: string; expires: Date } {
	const token = randomBytes(32).toString('base64url');
	const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
	db.prepare(
		`INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)`
	).run(hashToken(token), userId, nowISO(), expires.getTime(), userAgent.slice(0, 300));
	db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(nowISO(), userId);
	// Opportunistic cleanup of expired sessions.
	db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(Date.now());
	return { token, expires };
}

interface SessionRow {
	session_id: string;
	expires_at: number;
	id: string;
	username: string;
	display_name: string;
	role: Role;
}

/**
 * Look up the user for a session token. Sessions slide: once less than half the
 * lifetime remains, the expiry is pushed out again and `renewed` is returned.
 */
export function validateSession(
	db: DB,
	token: string
): { user: Me; expires: Date; renewed: boolean } | null {
	const row = db
		.prepare(
			`SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.display_name, u.role
			 FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.id = ? AND u.active = 1`
		)
		.get(hashToken(token)) as SessionRow | undefined;
	if (!row) return null;
	const now = Date.now();
	if (row.expires_at < now) {
		db.prepare(`DELETE FROM sessions WHERE id = ?`).run(row.session_id);
		return null;
	}
	const lifetime = config.sessionDays * 86_400_000;
	let expires = new Date(row.expires_at);
	let renewed = false;
	if (row.expires_at - now < lifetime / 2) {
		expires = new Date(now + lifetime);
		db.prepare(`UPDATE sessions SET expires_at = ? WHERE id = ?`).run(
			expires.getTime(),
			row.session_id
		);
		renewed = true;
	}
	return {
		user: { id: row.id, username: row.username, display_name: row.display_name, role: row.role },
		expires,
		renewed
	};
}

export function deleteSession(db: DB, token: string): void {
	db.prepare(`DELETE FROM sessions WHERE id = ?`).run(hashToken(token));
}

/** Sign a user out everywhere, optionally keeping the current session. */
export function deleteUserSessions(db: DB, userId: string, keepToken?: string): void {
	if (keepToken) {
		db.prepare(`DELETE FROM sessions WHERE user_id = ? AND id != ?`).run(
			userId,
			hashToken(keepToken)
		);
	} else {
		db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
	}
}

/* ----------------------------------------------------------- throttling -- */

interface Bucket {
	failures: number;
	resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const buckets = new Map<string, Bucket>();

/** Seconds until another login attempt is allowed, or 0 when not throttled. */
export function loginRetryAfter(key: string, now = Date.now()): number {
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) return 0;
	return bucket.failures >= MAX_FAILURES ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS });
	} else {
		bucket.failures += 1;
	}
	if (buckets.size > 10_000) {
		for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
	}
}

export function clearLoginFailures(key: string): void {
	buckets.delete(key);
}
