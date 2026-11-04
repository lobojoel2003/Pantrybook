import type { BuildInfo } from './types.ts';

declare const __PANTRYBOOK_BUILD__: BuildInfo | undefined;

/** Version, build number and commit baked in at build time (see vite.config.ts). */
export const BUILD: BuildInfo =
	typeof __PANTRYBOOK_BUILD__ !== 'undefined'
		? __PANTRYBOOK_BUILD__
		: { version: '0.0.0', buildNumber: '0', commit: 'unknown', builtAt: '', channel: 'local' };

/** "1.0.0 (build 42 · a1b2c3d)" */
export function versionLabel(info: BuildInfo = BUILD): string {
	return `${info.version} (build ${info.buildNumber} · ${info.commit})`;
}
