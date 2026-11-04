import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it } from 'vitest';
import { isSecureRequest } from './cookies.ts';

function event(url: string, headers: Record<string, string> = {}): RequestEvent {
	return { url: new URL(url), request: new Request(url, { headers }) } as unknown as RequestEvent;
}

describe('isSecureRequest', () => {
	afterEach(() => {
		delete process.env.PANTRYBOOK_SECURE_COOKIES;
	});

	it('trusts the browser origin over the assumed https scheme', () => {
		// adapter-node reports https by default, even for a plain-HTTP LAN install.
		expect(
			isSecureRequest(
				event('https://192.168.1.20:3000/api/auth/login', { origin: 'http://192.168.1.20:3000' })
			)
		).toBe(false);
		expect(
			isSecureRequest(
				event('https://pantry.example.org/api/auth/login', { origin: 'https://pantry.example.org' })
			)
		).toBe(true);
	});

	it('falls back to the referer, then the URL', () => {
		expect(
			isSecureRequest(event('https://10.0.0.5/api/session', { referer: 'http://10.0.0.5/' }))
		).toBe(false);
		expect(isSecureRequest(event('https://pantry.example.org/api/session'))).toBe(true);
		expect(isSecureRequest(event('http://localhost:3000/api/session'))).toBe(false);
	});

	it('can be forced with PANTRYBOOK_SECURE_COOKIES', () => {
		process.env.PANTRYBOOK_SECURE_COOKIES = 'true';
		expect(isSecureRequest(event('http://localhost/', { origin: 'http://localhost' }))).toBe(true);
		process.env.PANTRYBOOK_SECURE_COOKIES = 'false';
		expect(isSecureRequest(event('https://x.org/', { origin: 'https://x.org' }))).toBe(false);
	});
});
