import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { SESSION_COOKIE, validateSession } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { clearSessionCookie, setSessionCookie } from '#lib/server/cookies.ts';
import { closeDb, getDb } from '#lib/server/db.ts';
import { seedDemo } from '#lib/server/demo.ts';
import { countUsers } from '#lib/server/users.ts';
import { BUILD, versionLabel } from '#lib/shared/build.ts';

let demoTimer: ReturnType<typeof setInterval> | null = null;

export const init: ServerInit = async () => {
	if (building) return;
	const db = getDb();
	console.log(`[pantrybook] ${versionLabel(BUILD)} — data in ${config.dataDir}`);
	if (config.demo) {
		if (countUsers(db) === 0) {
			const summary = await seedDemo(db);
			console.log(
				`[pantrybook] demo mode: seeded ${summary.households} households, ${summary.visits} visits`
			);
		}
		if (config.demoResetHours > 0 && !demoTimer) {
			demoTimer = setInterval(() => {
				seedDemo(db)
					.then(() => console.log('[pantrybook] demo data reset'))
					.catch((err) => console.error('[pantrybook] demo reset failed', err));
			}, config.demoResetHours * 3_600_000);
			demoTimer.unref();
		}
	}
	const shutdown = () => {
		if (demoTimer) clearInterval(demoTimer);
		closeDb();
	};
	process.once('sveltekit:shutdown', shutdown);
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isApi = pathname.startsWith('/api/');

	event.locals.user = null;
	event.locals.sessionToken = null;

	if (isApi) {
		// Cross-site forms can only send "simple" content types. Requiring JSON on every
		// state-changing API call means browsers must preflight, which we never allow.
		if (MUTATING.has(event.request.method)) {
			const type = event.request.headers.get('content-type') ?? '';
			if (!type.toLowerCase().startsWith('application/json')) {
				return Response.json({ error: 'Send requests as application/json.' }, { status: 415 });
			}
		}

		const token = event.cookies.get(SESSION_COOKIE);
		if (token) {
			const session = validateSession(getDb(), token);
			if (session) {
				event.locals.user = session.user;
				event.locals.sessionToken = token;
				if (session.renewed) setSessionCookie(event, token, session.expires);
			} else {
				clearSessionCookie(event);
			}
		}
	}

	const response = await resolve(event);

	try {
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('Referrer-Policy', 'same-origin');
		response.headers.set('X-Frame-Options', 'DENY');
		response.headers.set(
			'Permissions-Policy',
			'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
		);
		if (isApi) response.headers.set('Cache-Control', 'no-store');
	} catch {
		// Some responses have immutable headers; that's fine.
	}
	return response;
};

export const handleError: HandleServerError = ({ error, event, kind }) => {
	if (kind === 'unknown') {
		console.error(`[pantrybook] ${event.request.method} ${event.url.pathname}`, error);
	}
};
