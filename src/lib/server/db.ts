import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { databasePath } from './config.ts';
import { MIGRATIONS } from './migrations.ts';

export type DB = Database.Database;

export function nowISO(): string {
	return new Date().toISOString();
}

export function migrate(db: DB): void {
	const current = db.pragma('user_version', { simple: true }) as number;
	if (current > MIGRATIONS.length) {
		throw new Error(
			`The database was created by a newer version of Pantrybook (schema ${current}, ` +
				`this build supports ${MIGRATIONS.length}). Upgrade Pantrybook to open it.`
		);
	}
	for (let i = current; i < MIGRATIONS.length; i++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[i]);
			db.pragma(`user_version = ${i + 1}`);
		})();
	}
}

export function openDatabase(file: string): DB {
	const db = new Database(file);
	if (file !== ':memory:') db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	db.pragma('synchronous = NORMAL');
	migrate(db);
	const row = db.prepare(`SELECT value FROM meta WHERE key = 'server_id'`).get() as
		{ value: string } | undefined;
	if (!row) {
		db.prepare(`INSERT INTO meta (key, value) VALUES ('server_id', ?), ('created_at', ?)`).run(
			randomUUID(),
			nowISO()
		);
	}
	return db;
}

let instance: DB | null = null;

/** The app's shared database connection, opened on first use. */
export function getDb(): DB {
	if (!instance) instance = openDatabase(databasePath());
	return instance;
}

/** Close the shared connection (used by tests and graceful shutdown). */
export function closeDb(): void {
	instance?.close();
	instance = null;
}

/** Allocate the next change number. Every write bumps the row's `rev` so devices can sync. */
export function nextRev(db: DB): number {
	const row = db
		.prepare(`UPDATE rev_counter SET value = value + 1 WHERE id = 1 RETURNING value`)
		.get() as { value: number };
	return row.value;
}

export function currentRev(db: DB): number {
	return (db.prepare(`SELECT value FROM rev_counter WHERE id = 1`).get() as { value: number })
		.value;
}

export function serverId(db: DB): string {
	return (db.prepare(`SELECT value FROM meta WHERE key = 'server_id'`).get() as { value: string })
		.value;
}

/**
 * A copy of the whole database with a new identity, for backups. When a backup is
 * restored, devices see the new identity and download a fresh copy instead of mixing
 * their newer local data with the older restored data.
 */
export function backupBytes(db: DB): Buffer {
	const copy = new Database(db.serialize());
	try {
		rotateServerId(copy);
		return copy.serialize();
	} finally {
		copy.close();
	}
}

/** Give the database a new identity, so every device throws away its local copy. */
export function rotateServerId(db: DB): void {
	db.prepare(`UPDATE meta SET value = ? WHERE key = 'server_id'`).run(randomUUID());
}

export function audit(db: DB, userId: string | null, action: string, detail = ''): void {
	db.prepare(`INSERT INTO audit_log (at, user_id, action, detail) VALUES (?, ?, ?, ?)`).run(
		nowISO(),
		userId,
		action,
		detail
	);
}
