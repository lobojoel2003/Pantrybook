import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { Me } from '#lib/shared/types.ts';
import type { z } from 'zod';
import { issuesOf } from './validation.ts';

/** Throw from an API handler to send `{ error, issues }` with a status code. */
export class ApiFail extends Error {
	readonly status: number;
	readonly issues?: string[];
	readonly headers?: Record<string, string>;

	constructor(
		status: number,
		message: string,
		issues?: string[],
		headers?: Record<string, string>
	) {
		super(message);
		this.status = status;
		this.issues = issues;
		this.headers = headers;
	}
}

/** Wrap an API handler so `ApiFail` becomes a JSON error response. */
export function api(
	handler: (event: RequestEvent) => Response | Promise<Response>
): RequestHandler {
	return async (event) => {
		try {
			return await handler(event);
		} catch (err) {
			if (err instanceof ApiFail) {
				return Response.json(
					{ error: err.message, ...(err.issues ? { issues: err.issues } : {}) },
					{ status: err.status, headers: err.headers }
				);
			}
			throw err;
		}
	};
}

export function requireUser(event: RequestEvent): Me {
	const user = event.locals.user;
	if (!user) throw new ApiFail(401, 'Please sign in again.');
	return user;
}

export function requireAdmin(event: RequestEvent): Me {
	const user = requireUser(event);
	if (user.role !== 'admin') throw new ApiFail(403, 'Only coordinators (admins) can do that.');
	return user;
}

export async function readJson<S extends z.ZodType>(
	event: RequestEvent,
	schema: S
): Promise<z.output<S>> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw new ApiFail(400, 'The request body must be JSON.');
	}
	const result = schema.safeParse(body);
	if (!result.success) {
		const issues = issuesOf(result.error);
		throw new ApiFail(400, issues[0] ?? 'Please check the form and try again.', issues);
	}
	return result.data;
}

export function csvResponse(csv: string, filename: string): Response {
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`
		}
	});
}

/** Query-string date in `YYYY-MM-DD` form, or a 400. */
export function dateParam(url: URL, name: string): string {
	const value = url.searchParams.get(name) ?? '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new ApiFail(400, `Add a ${name} date like 2026-01-31.`);
	}
	return value;
}
