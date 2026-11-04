/**
 * Starts the built app with an empty data folder for the end-to-end tests.
 * Run `npm run build` first.
 */
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dataDir = path.resolve(process.env.PANTRYBOOK_DATA_DIR ?? 'tests/.tmp/data');
rmSync(dataDir, { recursive: true, force: true });

if (!existsSync(path.resolve('build/index.js'))) {
	console.error('No build found. Run `npm run build` before the end-to-end tests.');
	process.exit(1);
}

await import(pathToFileURL(path.resolve('build/index.js')).href);
