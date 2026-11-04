/** Thin JSON client for the Pantrybook API. */

export class ApiError extends Error {
	readonly status: number;
	readonly issues: string[];
	/** True when the server could not be reached at all. */
	readonly offline: boolean;

	constructor(status: number, message: string, issues: string[] = [], offline = false) {
		super(message);
		this.status = status;
		this.issues = issues;
		this.offline = offline;
	}
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(path, {
			method,
			credentials: 'same-origin',
			headers: {
				Accept: 'application/json',
				...(method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' })
			},
			body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {})
		});
	} catch {
		throw new ApiError(0, "Can't reach the Pantrybook server right now.", [], true);
	}

	if (response.status === 204) return undefined as T;

	let data: unknown = null;
	const type = response.headers.get('content-type') ?? '';
	if (type.includes('application/json')) {
		try {
			data = await response.json();
		} catch {
			data = null;
		}
	}

	if (!response.ok) {
		const payload = (data ?? {}) as { error?: string; message?: string; issues?: string[] };
		const message =
			payload.error ??
			payload.message ??
			(response.status >= 500
				? 'The server had a problem. Please try again.'
				: `Request failed (${response.status}).`);
		// A gateway error usually means the server is down or restarting.
		const offline = response.status === 502 || response.status === 503 || response.status === 504;
		throw new ApiError(response.status, message, payload.issues ?? [], offline);
	}
	return data as T;
}

export const api = {
	get: <T>(path: string) => request<T>('GET', path),
	post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
	put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
	patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
	del: <T>(path: string) => request<T>('DELETE', path)
};

export function errorMessage(err: unknown): string {
	if (err instanceof ApiError) return err.message;
	if (err instanceof Error) return err.message;
	return 'Something went wrong.';
}

/** Trigger a browser download for a same-origin URL (CSV exports, backups). */
export function download(url: string): void {
	const a = document.createElement('a');
	a.href = url;
	a.rel = 'noopener';
	a.download = '';
	document.body.appendChild(a);
	a.click();
	a.remove();
}
