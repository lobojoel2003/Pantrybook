import { describe, expect, it } from 'vitest';
import {
	clearLoginFailures,
	createSession,
	deleteSession,
	hashPassword,
	loginRetryAfter,
	passwordProblem,
	recordLoginFailure,
	validateSession,
	verifyPassword
} from './auth.ts';
import { addUser, testDb } from './test-helpers.ts';
import { updateUser } from './users.ts';

describe('passwords', () => {
	it('hashes with a random salt and verifies', async () => {
		const a = await hashPassword('correct horse');
		const b = await hashPassword('correct horse');
		expect(a).not.toBe(b);
		expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
		expect(await verifyPassword('correct horse', a)).toBe(true);
		expect(await verifyPassword('wrong horse', a)).toBe(false);
		expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
	});

	it('enforces a minimum length', () => {
		expect(passwordProblem('short')).toMatch(/at least 8/);
		expect(passwordProblem('long enough')).toBeNull();
	});
});

describe('sessions', () => {
	it('creates, validates and deletes sessions', () => {
		const db = testDb();
		const user = addUser(db, 'admin');
		const { token } = createSession(db, user.id);
		expect(validateSession(db, token)?.user.id).toBe(user.id);
		expect(validateSession(db, `${token}x`)).toBeNull();
		deleteSession(db, token);
		expect(validateSession(db, token)).toBeNull();
	});

	it('rejects sessions of deactivated users', () => {
		const db = testDb();
		const user = addUser(db);
		const { token } = createSession(db, user.id);
		updateUser(db, user.id, { active: false });
		expect(validateSession(db, token)).toBeNull();
	});

	it('stores only a hash of the token', () => {
		const db = testDb();
		const user = addUser(db);
		const { token } = createSession(db, user.id);
		const row = db.prepare('SELECT id FROM sessions').get() as { id: string };
		expect(row.id).not.toBe(token);
		expect(row.id).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('login throttling', () => {
	it('blocks after ten failures and clears on success', () => {
		const key = `test-${Math.random()}`;
		const now = Date.now();
		for (let i = 0; i < 9; i++) recordLoginFailure(key, now);
		expect(loginRetryAfter(key, now)).toBe(0);
		recordLoginFailure(key, now);
		expect(loginRetryAfter(key, now)).toBeGreaterThan(0);
		expect(loginRetryAfter(key, now + 16 * 60 * 1000)).toBe(0);
		clearLoginFailures(key);
		expect(loginRetryAfter(key, now)).toBe(0);
	});
});
