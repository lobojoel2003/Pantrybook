#!/usr/bin/env node
/**
 * Pantrybook command-line tools for people running their own server.
 *
 *   node scripts/cli.ts info
 *   node scripts/cli.ts create-admin <username> [display name]
 *   node scripts/cli.ts reset-password <username>
 *   node scripts/cli.ts backup <file.db>
 *   node scripts/cli.ts restore <file.db>      (stop the server first)
 *   node scripts/cli.ts seed-demo [--force]
 *
 * Uses the same PANTRYBOOK_DATA_DIR as the server. In Docker:
 *   docker exec -it pantrybook node scripts/cli.ts reset-password admin
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { hashPassword, deleteUserSessions, passwordProblem } from '#lib/server/auth.ts';
import { config, databasePath, DEMO_PASSWORD } from '#lib/server/config.ts';
import { audit, closeDb, getDb, openDatabase, rotateServerId } from '#lib/server/db.ts';
import { MIGRATIONS } from '#lib/server/migrations.ts';
import { seedDemo } from '#lib/server/demo.ts';
import { seedDefaultPrograms } from '#lib/server/programs.ts';
import { countUsers, createUser, findUserByUsername, updateUser } from '#lib/server/users.ts';

const [command, ...args] = process.argv.slice(2);

function fail(message: string): never {
	console.error(`Error: ${message}`);
	process.exit(1);
}

async function askPassword(): Promise<string> {
	if (process.env.PANTRYBOOK_PASSWORD) return process.env.PANTRYBOOK_PASSWORD;
	if (!process.stdin.isTTY) {
		const generated = randomBytes(9).toString('base64url');
		console.log(`Generated password: ${generated}`);
		return generated;
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question('New password (leave blank to generate one): ');
	rl.close();
	if (answer) return answer;
	const generated = randomBytes(9).toString('base64url');
	console.log(`Generated password: ${generated}`);
	return generated;
}

async function main() {
	switch (command) {
		case 'info': {
			const db = getDb();
			const count = (table: string) =>
				(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
			console.log(`Database:   ${databasePath()}`);
			console.log(`Schema:     ${db.pragma('user_version', { simple: true })}`);
			console.log(`Users:      ${count('users')}`);
			console.log(`Households: ${count('households')}`);
			console.log(`Visits:     ${count('visits')}`);
			console.log(`Programs:   ${count('programs')}`);
			break;
		}
		case 'create-admin': {
			const [username, ...nameParts] = args;
			if (!username) fail('Usage: create-admin <username> [display name]');
			const db = getDb();
			if (findUserByUsername(db, username)) fail(`User "${username}" already exists.`);
			const password = await askPassword();
			const problem = passwordProblem(password);
			if (problem) fail(problem);
			const firstUser = countUsers(db) === 0;
			const user = createUser(db, {
				username,
				display_name: nameParts.join(' ') || username,
				role: 'admin',
				password_hash: await hashPassword(password)
			});
			if (firstUser) seedDefaultPrograms(db);
			audit(db, null, 'cli.create-admin', user.username);
			console.log(`Created coordinator account "${user.username}".`);
			break;
		}
		case 'reset-password': {
			const [username] = args;
			if (!username) fail('Usage: reset-password <username>');
			const db = getDb();
			const user = findUserByUsername(db, username);
			if (!user) fail(`No user named "${username}".`);
			const password = await askPassword();
			const problem = passwordProblem(password);
			if (problem) fail(problem);
			updateUser(db, user.id, { password_hash: await hashPassword(password), active: true });
			deleteUserSessions(db, user.id);
			audit(db, null, 'cli.reset-password', user.username);
			console.log(`Password reset for "${user.username}". They have been signed out everywhere.`);
			break;
		}
		case 'backup': {
			const [file] = args;
			if (!file) fail('Usage: backup <file.db>');
			await getDb().backup(file);
			// The copy gets its own identity so devices notice if it is ever restored.
			const copy = new Database(file);
			rotateServerId(copy);
			copy.close();
			console.log(`Backup written to ${file}`);
			break;
		}
		case 'restore': {
			const [file] = args;
			if (!file || !existsSync(file)) fail('Usage: restore <backup.db>  (stop Pantrybook first)');
			let schema = 0;
			try {
				const check = new Database(file, { readonly: true, fileMustExist: true });
				schema = check.pragma('user_version', { simple: true }) as number;
				check.prepare('SELECT COUNT(*) FROM households').get();
				check.close();
			} catch {
				fail(`${file} is not a Pantrybook backup.`);
			}
			if (schema > MIGRATIONS.length) fail('That backup is from a newer version of Pantrybook.');
			const target = databasePath();
			if (existsSync(target)) {
				const saved = `${target}.before-restore-${Date.now()}`;
				await getDb().backup(saved);
				closeDb();
				console.log(`Saved the current database to ${saved}`);
			}
			for (const suffix of ['', '-wal', '-shm']) rmSync(`${target}${suffix}`, { force: true });
			copyFileSync(file, target);
			const restored = openDatabase(target);
			rotateServerId(restored);
			restored.close();
			console.log(`Restored ${file}. Start Pantrybook again; devices will download a fresh copy.`);
			break;
		}
		case 'seed-demo': {
			const db = getDb();
			if (countUsers(db) > 0 && !args.includes('--force')) {
				fail(
					`${databasePath()} already has data. Re-run with --force to replace ALL of it with demo data.`
				);
			}
			const summary = await seedDemo(db);
			console.log(
				`Seeded ${summary.households} households and ${summary.visits} visits into ${config.dataDir}.`
			);
			console.log(`Sign in as "admin" or "volunteer" with the password "${DEMO_PASSWORD}".`);
			break;
		}
		default:
			console.log(`Pantrybook CLI

Commands:
  info                                 Show database location and counts
  create-admin <username> [name]       Create a coordinator (admin) account
  reset-password <username>            Set a new password and sign the user out
  backup <file.db>                     Write a consistent copy of the database
  restore <file.db>                    Replace the database with a backup (stop the server first)
  seed-demo [--force]                  Fill the database with fictional demo data

Set PANTRYBOOK_DATA_DIR to choose the data folder (default: ./data).
Set PANTRYBOOK_PASSWORD to pass a password without a prompt.`);
			if (command && command !== 'help' && command !== '--help') process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
