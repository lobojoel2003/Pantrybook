/**
 * Database migrations. Each entry runs once, in order, inside a transaction.
 * `PRAGMA user_version` records how many have been applied.
 * Never edit a released migration: add a new one instead.
 */
export const MIGRATIONS: string[] = [
	/* 1 — initial schema (v1.0.0) */ `
	CREATE TABLE meta (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE rev_counter (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		value INTEGER NOT NULL
	);
	INSERT INTO rev_counter (id, value) VALUES (1, 0);

	CREATE TABLE settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		display_name TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL CHECK (role IN ('admin', 'volunteer')),
		active INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		last_login_at TEXT
	);

	CREATE TABLE sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
		created_at TEXT NOT NULL,
		expires_at INTEGER NOT NULL,
		user_agent TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX sessions_user ON sessions (user_id);

	CREATE TABLE programs (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		unit TEXT NOT NULL DEFAULT '',
		default_quantity REAL,
		limit_count INTEGER,
		limit_period TEXT CHECK (limit_period IN ('day', 'week', 'month', 'year', 'rolling')),
		limit_days INTEGER,
		active INTEGER NOT NULL DEFAULT 1,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		rev INTEGER NOT NULL
	);
	CREATE INDEX programs_rev ON programs (rev);

	CREATE TABLE households (
		id TEXT PRIMARY KEY,
		number INTEGER UNIQUE,
		first_name TEXT NOT NULL DEFAULT '',
		last_name TEXT NOT NULL DEFAULT '',
		phone TEXT NOT NULL DEFAULT '',
		email TEXT NOT NULL DEFAULT '',
		address TEXT NOT NULL DEFAULT '',
		city TEXT NOT NULL DEFAULT '',
		state TEXT NOT NULL DEFAULT '',
		zip TEXT NOT NULL DEFAULT '',
		adults INTEGER NOT NULL DEFAULT 1,
		children INTEGER NOT NULL DEFAULT 0,
		seniors INTEGER NOT NULL DEFAULT 0,
		language TEXT NOT NULL DEFAULT '',
		dietary TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		income_eligible INTEGER NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
		verified_at TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
		updated_at TEXT NOT NULL,
		deleted INTEGER NOT NULL DEFAULT 0,
		rev INTEGER NOT NULL
	);
	CREATE INDEX households_rev ON households (rev);
	CREATE INDEX households_name ON households (last_name, first_name);

	CREATE TABLE visits (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households (id),
		program_id TEXT NOT NULL REFERENCES programs (id),
		visit_date TEXT NOT NULL,
		visited_at TEXT NOT NULL,
		quantity REAL,
		adults INTEGER NOT NULL DEFAULT 0,
		children INTEGER NOT NULL DEFAULT 0,
		seniors INTEGER NOT NULL DEFAULT 0,
		notes TEXT NOT NULL DEFAULT '',
		over_limit INTEGER NOT NULL DEFAULT 0,
		override_reason TEXT NOT NULL DEFAULT '',
		voided INTEGER NOT NULL DEFAULT 0,
		void_reason TEXT NOT NULL DEFAULT '',
		voided_by TEXT REFERENCES users (id) ON DELETE SET NULL,
		created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		rev INTEGER NOT NULL
	);
	CREATE INDEX visits_lookup ON visits (household_id, program_id, visit_date);
	CREATE INDEX visits_date ON visits (visit_date);
	CREATE INDEX visits_rev ON visits (rev);

	CREATE TABLE audit_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		at TEXT NOT NULL,
		user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
		action TEXT NOT NULL,
		detail TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX audit_log_at ON audit_log (at);
	`
];
