/**
 * Runs during `npm version <patch|minor|major>` (the "version" lifecycle script).
 * Moves the "Unreleased" notes in CHANGELOG.md under the new version and updates the
 * comparison links, so the release commit and tag carry matching notes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version as string;
const file = path.join(root, 'CHANGELOG.md');
let text = readFileSync(file, 'utf8');

if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(text)) {
	console.log(`CHANGELOG.md already has a section for ${version}.`);
	process.exit(0);
}

const date = new Date().toISOString().slice(0, 10);
const unreleased = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[|^\[[^\]]+\]: |(?![\s\S]))/m.exec(
	text
);
if (!unreleased || !unreleased[1].trim()) {
	console.error('CHANGELOG.md: add notes under "## [Unreleased]" before running npm version.');
	process.exit(1);
}

text = text.replace(
	unreleased[0],
	`## [Unreleased]\n\n## [${version}] - ${date}\n\n${unreleased[1].trim()}\n\n`
);

const repo = 'https://github.com/lobojoel2003/Pantrybook';
const previous = /^## \[(\d+\.\d+\.\d+[^\]]*)\]/gm;
const versions = [...text.matchAll(previous)].map((m) => m[1]);
const prior = versions[1];
text = text.replace(
	/^\[Unreleased\]: .*$/m,
	`[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${
		prior ? `${repo}/compare/v${prior}...v${version}` : `${repo}/releases/tag/v${version}`
	}`
);

writeFileSync(file, text);
console.log(`CHANGELOG.md: released ${version} (${date}).`);
