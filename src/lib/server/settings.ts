import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import type { Settings } from '#lib/shared/types.ts';
import { nextRev, type DB } from './db.ts';

export function getSettings(db: DB): Settings {
	const rows = db.prepare(`SELECT key, value FROM settings`).all() as {
		key: string;
		value: string;
	}[];
	const out: Settings = { ...DEFAULT_SETTINGS };
	const record = out as unknown as Record<string, unknown>;
	for (const { key, value } of rows) {
		if (key in DEFAULT_SETTINGS) {
			try {
				record[key] = JSON.parse(value);
			} catch {
				// Ignore a corrupt value and keep the default.
			}
		}
	}
	return out;
}

export function saveSettings(db: DB, patch: Partial<Settings>): Settings {
	const upsert = db.prepare(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT (key) DO UPDATE SET value = excluded.value`
	);
	db.transaction(() => {
		for (const [key, value] of Object.entries(patch)) {
			if (key in DEFAULT_SETTINGS && value !== undefined) upsert.run(key, JSON.stringify(value));
		}
		// Bump the change counter so devices pull the new settings promptly.
		nextRev(db);
	})();
	return getSettings(db);
}
