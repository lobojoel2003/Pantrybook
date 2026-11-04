/**
 * Render the PNG app icons in static/icons from the SVG logo.
 * Run with `npm run icons` after changing static/favicon.svg.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = readFileSync(path.join(root, 'static/favicon.svg'), 'utf8');
const out = path.join(root, 'static/icons');
mkdirSync(out, { recursive: true });

// Full-bleed artwork (no rounded corners) for maskable and Apple icons, which the OS crops.
const square = svg.replace('rx="15"', 'rx="0"');

const targets = [
	{ file: 'icon-192.png', size: 192, art: svg, scale: 1 },
	{ file: 'icon-512.png', size: 512, art: svg, scale: 1 },
	// Maskable: keep the artwork inside the central 80% safe zone.
	{ file: 'icon-maskable-512.png', size: 512, art: square, scale: 0.8, bleed: '#1f6b45' },
	{ file: 'apple-touch-icon.png', size: 180, art: square, scale: 0.9, bleed: '#1f6b45' }
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
	const inner = Math.round(t.size * t.scale);
	await page.setViewportSize({ width: t.size, height: t.size });
	await page.setContent(
		`<html><body style="margin:0;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;background:${t.bleed ?? 'transparent'}">
			<div style="width:${inner}px;height:${inner}px">${t.art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
		</body></html>`
	);
	await page.screenshot({ path: path.join(out, t.file), omitBackground: !t.bleed });
	console.log(`wrote static/icons/${t.file}`);
}
await browser.close();
