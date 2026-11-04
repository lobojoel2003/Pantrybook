import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function git(args: string): string {
	try {
		return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

/**
 * Build metadata baked into the app.
 * - version: package.json (SemVer, bumped with `npm version`)
 * - buildNumber: the number of commits up to this one, so it always increases and is the
 *   same wherever the commit is built. CI and Docker pass it in as BUILD_NUMBER.
 * - commit: short git SHA (GIT_SHA in Docker, where there is no .git folder)
 */
const commit = (process.env.GIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD') || 'unknown')
	.slice(0, 7)
	.toLowerCase();
const buildNumber = process.env.BUILD_NUMBER || git('rev-list --count HEAD') || '0';
const builtAt = process.env.SOURCE_DATE_EPOCH
	? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
	: new Date(git('log -1 --format=%cI') || Date.now()).toISOString();

const build = {
	version: pkg.version as string,
	buildNumber,
	commit,
	builtAt,
	channel: process.env.RELEASE_CHANNEL || (process.env.CI ? 'ci' : 'local')
};

export default defineConfig({
	define: {
		__PANTRYBOOK_BUILD__: JSON.stringify(build)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ precompress: true }),
			// Absolute asset URLs, so the one cached app shell works offline on every route.
			paths: { relative: false },
			version: {
				name: `${build.version}+${build.buildNumber}.${build.commit}`,
				pollInterval: 5 * 60 * 1000
			},
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'manifest-src': ['self'],
					'worker-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
