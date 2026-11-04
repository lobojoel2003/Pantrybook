import type { RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE } from './auth.ts';

/**
 * Whether the browser reached us over HTTPS.
 *
 * adapter-node assumes `https` unless PROTOCOL_HEADER says otherwise, which is right
 * behind a TLS proxy but wrong for a pantry running Pantrybook over plain HTTP on its
 * own network. A `Secure` cookie would be silently dropped there and nobody could
 * sign in, so prefer what the browser itself reports (Origin, then Referer).
 * PANTRYBOOK_SECURE_COOKIES=true|false overrides the detection.
 */
export function isSecureRequest(event: RequestEvent): boolean {
	const forced = (process.env.PANTRYBOOK_SECURE_COOKIES ?? '').toLowerCase();
	if (forced === 'true' || forced === '1') return true;
	if (forced === 'false' || forced === '0') return false;
	const seen = event.request.headers.get('origin') ?? event.request.headers.get('referer');
	if (seen?.startsWith('http://')) return false;
	if (seen?.startsWith('https://')) return true;
	return event.url.protocol === 'https:';
}

export function setSessionCookie(event: RequestEvent, token: string, expires: Date): void {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecureRequest(event),
		expires
	});
}

export function clearSessionCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE, { path: '/', secure: isSecureRequest(event) });
}
