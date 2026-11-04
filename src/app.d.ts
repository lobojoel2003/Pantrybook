// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Me } from '#lib/shared/types.ts';

declare global {
	namespace App {
		interface Locals {
			user: Me | null;
			sessionToken: string | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
