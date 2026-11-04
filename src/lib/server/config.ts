import { mkdirSync } from 'node:fs';
import path from 'node:path';

function flag(name: string): boolean {
	return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').toLowerCase());
}

function int(name: string, fallback: number): number {
	const n = Number.parseInt(process.env[name] ?? '', 10);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Runtime configuration, read from environment variables. */
export const config = {
	/** Folder holding the SQLite database. Mount a volume here in production. */
	dataDir: path.resolve(process.env.PANTRYBOOK_DATA_DIR || 'data'),
	/** Demo mode: seed fake data, show demo credentials, and reset on a schedule. */
	demo: flag('PANTRYBOOK_DEMO'),
	/** Hours between demo resets (0 = only on start). */
	demoResetHours: int('PANTRYBOOK_DEMO_RESET_HOURS', 24),
	/** Session lifetime in days. */
	sessionDays: int('PANTRYBOOK_SESSION_DAYS', 30),
	/** How many days of visit history a device downloads for offline use. */
	offlineVisitDays: int('PANTRYBOOK_OFFLINE_VISIT_DAYS', 400)
};

export function databasePath(): string {
	if (process.env.PANTRYBOOK_DB === ':memory:') return ':memory:';
	mkdirSync(config.dataDir, { recursive: true });
	return path.join(config.dataDir, 'pantrybook.db');
}

export const DEMO_PASSWORD = 'pantrybook';
