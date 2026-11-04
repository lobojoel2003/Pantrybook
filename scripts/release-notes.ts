/**
 * Print GitHub release notes for a version: its CHANGELOG.md section plus install steps.
 *   node scripts/release-notes.ts 1.2.3 [--image ghcr.io/owner/pantrybook] [--digest sha256:…] [--build 42]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const version = args[0]?.replace(/^v/, '');
if (!version) {
	console.error(
		'Usage: node scripts/release-notes.ts <version> [--image …] [--digest …] [--build …]'
	);
	process.exit(1);
}
const option = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const image = option('image') ?? 'ghcr.io/lobojoel2003/pantrybook';
const digest = option('digest');
const build = option('build');

const changelog = readFileSync(path.resolve(import.meta.dirname, '../CHANGELOG.md'), 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const match = new RegExp(
	`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]: )`,
	'm'
).exec(changelog);
if (!match) {
	console.error(`CHANGELOG.md has no section for ${version}`);
	process.exit(1);
}
const notes = match[1].trim();

console.log(`${notes}

## Install

**Docker** (amd64 and arm64, including Raspberry Pi):

\`\`\`bash
docker run -d --name pantrybook -p 3000:3000 -v pantrybook-data:/data ${image}:${version}
\`\`\`

**Without Docker** (Node.js 22.18 or newer): download \`pantrybook-${version}.tar.gz\` below, then

\`\`\`bash
tar xzf pantrybook-${version}.tar.gz && cd pantrybook-${version}
npm ci --omit=dev --ignore-scripts
node build
\`\`\`

Upgrading? Back up your database first (Admin → Data → Download backup). Pantrybook upgrades
the database automatically when it starts.

## Build details

| | |
|---|---|
| Version | \`${version}\` |
| Build number | \`${build ?? 'n/a'}\` |
| Image | \`${image}:${version}\` |
${digest ? `| Image digest | \`${digest}\` |\n` : ''}| Checksums | \`SHA256SUMS\` (verify with \`sha256sum -c SHA256SUMS\`) |
| Provenance | Signed build attestations: \`gh attestation verify <file> --repo lobojoel2003/Pantrybook\` |`);
