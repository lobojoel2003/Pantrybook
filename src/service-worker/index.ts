/// <reference lib="webworker" />
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

/**
 * Pantrybook's service worker. It keeps the app itself (code, styles, icons and the
 * page shell) available offline. Data is never cached here: the app keeps its own
 * offline copy in IndexedDB and talks to /api only when it can.
 */

const CACHE = `pantrybook-${version}`;
const SHELL = '/';
/** Manifest paths are relative to the app's base; turn them into absolute pathnames. */
const toPath = (p: string) => new URL(p, self.location.origin + '/').pathname;
const STATIC = new Set([...immutable, ...assets].map((f) => toPath(f.path)));
const PRECACHE = [...STATIC, SHELL];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			// First install: take over straight away. Updates wait for the app to say so.
			const clients = await self.clients.matchAll();
			if (clients.length === 0) await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE && key.startsWith('pantrybook-')) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	// Live data and file downloads always go to the network.
	if (url.pathname.startsWith('/api/')) return;

	if (STATIC.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(url.pathname, { ignoreSearch: true });
				return cached ?? fetch(request);
			})()
		);
		return;
	}

	if (request.mode === 'navigate') {
		// Pages are rendered in the browser, so every route shares the same shell.
		// Prefer the network (to pick up new versions), but don't keep a volunteer
		// waiting on slow pantry Wi-Fi: after a few seconds, use the cached shell.
		event.respondWith(navigate(request));
	}
});

async function cachedShell(): Promise<Response | undefined> {
	return caches.match(SHELL);
}

async function navigate(request: Request): Promise<Response> {
	// The shell cached at install time belongs to this exact version, so it always matches
	// the cached code. Never overwrite it with a page from the network, which might be newer.
	const network = fetch(request);
	const timeout = new Promise<Response | undefined>((resolve) => {
		setTimeout(async () => resolve(await cachedShell()), NETWORK_TIMEOUT_MS);
	});
	try {
		const winner = await Promise.race([network, timeout]);
		if (winner) return winner;
		return await network;
	} catch {
		return (
			(await cachedShell()) ??
			new Response('Pantrybook is offline and has not been saved on this device yet.', {
				status: 503,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			})
		);
	}
}
