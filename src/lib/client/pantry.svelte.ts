/* eslint-disable svelte/prefer-svelte-reactivity --
   Collections here are immutable snapshots: each change builds a new Map and assigns it
   to a $state.raw field, which is what triggers updates. They are never mutated in place. */
import { addDays, isISODate, today } from '#lib/shared/dates.ts';
import { fullName, indexHousehold, normalizeHousehold } from '#lib/shared/household.ts';
import { uuid } from '#lib/shared/ids.ts';
import { evaluateEligibility, type Eligibility } from '#lib/shared/limits.ts';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import type {
	Household,
	HouseholdInput,
	Me,
	Mutation,
	Program,
	SessionInfo,
	Settings,
	SyncPullResponse,
	SyncPushResponse,
	UserName,
	Visit
} from '#lib/shared/types.ts';
import { ApiError, api } from './api.ts';
import { openLocalStore, type LocalStore, type OutboxEntry } from './local-store.ts';
import { toast } from './toast.svelte.ts';

export type SessionState = 'unknown' | 'setup' | 'signed-out' | 'signed-in';

const SYNC_INTERVAL_MS = 30_000;
const PUSH_BATCH = 100;

/**
 * The browser side of Pantrybook. Holds the device's copy of the data, records
 * changes locally first (so everything works offline), and keeps a queue of
 * changes that it sends to the server whenever it can.
 */
class Pantry {
	/* ------------------------------------------------------------ status -- */
	loaded = $state(false);
	session = $state<SessionState>('unknown');
	me = $state<Me | null>(null);
	demo = $state(false);
	orgName = $state('');
	/** The browser reports a network connection. */
	online = $state(true);
	/** The last request to the server got through. */
	reachable = $state(true);
	syncing = $state(false);
	lastSyncAt = $state<string | null>(null);
	syncError = $state<string | null>(null);
	/** The server rejected our session while we were working offline. */
	needsSignIn = $state(false);
	/** At least one full download has finished on this device. */
	hasData = $state(false);
	persistent = $state(true);

	outbox = $state.raw<OutboxEntry[]>([]);
	/** Changes made by the signed-in person (others' wait until they sign in again here). */
	myOutbox = $derived(this.outbox.filter((e) => !e.user_id || e.user_id === this.me?.id));
	pendingCount = $derived(this.myOutbox.filter((e) => e.status === 'pending').length);
	failedEntries = $derived(this.myOutbox.filter((e) => e.status === 'failed'));
	othersWaiting = $derived(this.outbox.length - this.myOutbox.length);

	/* -------------------------------------------------------------- data -- */
	households = $state.raw(new Map<string, Household>());
	visits = $state.raw(new Map<string, Visit>());
	programs = $state.raw<Program[]>([]);
	settings = $state.raw<Settings>(DEFAULT_SETTINGS);
	users = $state.raw(new Map<string, string>());
	visitWindowStart = $state<string>('');

	activePrograms = $derived(
		this.programs
			.filter((p) => p.active)
			.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
	);
	searchIndex = $derived(
		[...this.households.values()].filter((h) => !h.deleted).map(indexHousehold)
	);
	visitsByHousehold = $derived.by(() => {
		const map = new Map<string, Visit[]>();
		for (const v of this.visits.values()) {
			const list = map.get(v.household_id);
			if (list) list.push(v);
			else map.set(v.household_id, [v]);
		}
		for (const list of map.values()) {
			list.sort(
				(a, b) =>
					b.visit_date.localeCompare(a.visit_date) || b.visited_at.localeCompare(a.visited_at)
			);
		}
		return map;
	});

	private store: LocalStore | null = null;
	private booted: Promise<void> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private syncAgain = false;
	private syncSoonTimer: ReturnType<typeof setTimeout> | null = null;
	/** The sync in progress, if any. */
	private running: Promise<void> | null = null;
	/** Bumped whenever the local copy is replaced, so an older sync stops writing. */
	private generation = 0;
	private paused = false;
	private logoutFlush: Promise<void> | null = null;

	/* -------------------------------------------------------------- boot -- */

	/** Load the local copy, then check the session with the server. Safe to call repeatedly. */
	boot(): Promise<void> {
		this.booted ??= this.doBoot();
		return this.booted;
	}

	private async doBoot() {
		this.online = navigator.onLine;
		window.addEventListener('online', () => {
			this.online = true;
			void this.flushPendingLogout().then(() => this.sync());
		});
		window.addEventListener('offline', () => {
			this.online = false;
		});
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.sync();
		});

		this.store = await openLocalStore();
		this.persistent = this.store.persistent;
		await this.loadLocal();
		this.loaded = true;
		await this.checkSession();
	}

	private async loadLocal() {
		const s = this.store!;
		const [households, visits, programs, outbox] = await Promise.all([
			s.all('households'),
			s.all('visits'),
			s.all('programs'),
			s.outbox()
		]);
		this.households = new Map(households.map((h) => [h.id, h]));
		this.visits = new Map(visits.map((v) => [v.id, v]));
		this.programs = programs;
		this.outbox = outbox;
		this.me = (await s.getMeta<Me>('me')) ?? null;
		this.settings = { ...DEFAULT_SETTINGS, ...((await s.getMeta<Settings>('settings')) ?? {}) };
		this.orgName = this.settings.org_name;
		this.users = new Map(
			((await s.getMeta<UserName[]>('users')) ?? []).map((u) => [u.id, u.display_name])
		);
		this.lastSyncAt = (await s.getMeta<string>('lastSyncAt')) ?? null;
		this.visitWindowStart = (await s.getMeta<string>('visitWindowStart')) ?? '';
		this.hasData = (await s.getMeta<number>('cursor')) !== undefined;
	}

	/** Ask the server who we are. Works offline by trusting the cached identity. */
	async checkSession(): Promise<void> {
		await this.flushPendingLogout();
		try {
			const info = await api.get<SessionInfo>('/api/session');
			this.reachable = true;
			this.demo = info.demo;
			this.orgName = info.org_name;
			if (info.setup_required) {
				this.session = 'setup';
				return;
			}
			if (info.user) {
				await this.signedIn(info.user);
			} else {
				this.session = 'signed-out';
				this.me = null;
				await this.store?.setMeta('me', null);
			}
		} catch (err) {
			this.reachable = false;
			this.session = this.me ? 'signed-in' : 'signed-out';
			if (this.me) this.startTimer();
			if (!(err instanceof ApiError && err.offline)) console.error(err);
		}
	}

	private async signedIn(user: Me) {
		this.me = user;
		this.session = 'signed-in';
		this.needsSignIn = false;
		await this.store?.setMeta('me', user);
		await this.store?.setMeta('logoutPending', false);
		this.startTimer();
		void this.sync();
	}

	private startTimer() {
		if (this.timer) return;
		this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
	}

	/* -------------------------------------------------------------- auth -- */

	async login(username: string, password: string): Promise<void> {
		// Finish any sign-out made offline first, so it can't end this new session.
		await this.flushPendingLogout();
		const { user } = await api.post<{ user: Me }>('/api/auth/login', { username, password });
		await this.signedIn(user);
	}

	async setup(input: {
		org_name: string;
		username: string;
		display_name: string;
		password: string;
	}): Promise<void> {
		const { user } = await api.post<{ user: Me }>('/api/setup', input);
		this.orgName = input.org_name;
		await this.signedIn(user);
	}

	/**
	 * Sign out and remove households and visits from this device, so the next person to
	 * use it can't see them. This person's unsynced changes stay queued and upload the
	 * next time they sign in here.
	 */
	async logout(): Promise<void> {
		await this.quiesce();
		try {
			await api.post('/api/auth/logout');
		} catch {
			// Offline: finish signing out with the server as soon as we reconnect.
			await this.store?.setMeta('logoutPending', true);
		}
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		await this.wipeReplica();
		await this.store?.setMeta('me', null);
		this.me = null;
		this.session = 'signed-out';
		this.paused = false;
	}

	/** Tell the server about a sign-out that happened while offline. */
	private flushPendingLogout(): Promise<void> {
		this.logoutFlush ??= (async () => {
			try {
				if (!(await this.store?.getMeta<boolean>('logoutPending'))) return;
				await api.post('/api/auth/logout');
				await this.store?.setMeta('logoutPending', false);
			} catch {
				// Still offline; try again later.
			}
		})().finally(() => {
			this.logoutFlush = null;
		});
		return this.logoutFlush;
	}

	/* ----------------------------------------------------------- queries -- */

	household(id: string): Household | undefined {
		return this.households.get(id);
	}

	program(id: string): Program | undefined {
		return this.programs.find((p) => p.id === id);
	}

	userName(id: string | null): string {
		if (!id) return '';
		return this.users.get(id) ?? (id === this.me?.id ? this.me.display_name : '');
	}

	householdVisits(id: string): Visit[] {
		return this.visitsByHousehold.get(id) ?? [];
	}

	eligibility(householdId: string, program: Program, date = today()): Eligibility {
		const dates = this.householdVisits(householdId)
			.filter((v) => v.program_id === program.id && !v.voided)
			.map((v) => v.visit_date);
		return evaluateEligibility(program, dates, date, this.settings.week_starts_on);
	}

	/** Whether this person may record a visit beyond a program's limit. */
	canOverride(): boolean {
		const policy = this.settings.override_policy;
		if (policy === 'anyone') return true;
		if (policy === 'admin') return this.me?.role === 'admin';
		return false;
	}

	isPending(id: string): boolean {
		return this.myOutbox.some((e) => e.status === 'pending' && e.mutation.data.id === id);
	}

	/* --------------------------------------------------------- mutations -- */

	async saveHousehold(input: HouseholdInput, id?: string): Promise<Household> {
		const existing = id ? this.households.get(id) : undefined;
		const now = new Date().toISOString();
		const clean = normalizeHousehold(input);
		const household: Household = {
			id: existing?.id ?? uuid(),
			number: existing?.number ?? null,
			created_at: existing?.created_at ?? now,
			deleted: false,
			rev: existing?.rev ?? 0,
			...clean,
			updated_at: now
		};
		await this.applyHouseholds([household]);
		await this.enqueue(
			{
				id: uuid(),
				type: 'household.save',
				at: now,
				data: { ...clean, id: household.id, updated_at: now }
			},
			`${existing ? 'Updated' : 'Registered'} ${fullName(household)}`
		);
		return household;
	}

	/** Mark a household's details as confirmed today. */
	async verifyHousehold(id: string): Promise<void> {
		const h = this.households.get(id);
		if (h) await this.saveHousehold({ ...h, verified_at: today() }, id);
	}

	async checkIn(input: {
		household: Household;
		program: Program;
		quantity: number | null;
		notes?: string;
		override_reason?: string;
		date?: string;
	}): Promise<Visit> {
		const date = input.date && isISODate(input.date) ? input.date : today();
		const eligibility = this.eligibility(input.household.id, input.program, date);
		const now = new Date().toISOString();
		const visit: Visit = {
			id: uuid(),
			household_id: input.household.id,
			program_id: input.program.id,
			visit_date: date,
			visited_at: now,
			quantity: input.quantity,
			notes: (input.notes ?? '').trim(),
			override_reason: eligibility.allowed ? '' : (input.override_reason ?? '').trim(),
			adults: input.household.adults,
			children: input.household.children,
			seniors: input.household.seniors,
			over_limit: !eligibility.allowed,
			voided: false,
			void_reason: '',
			created_by: this.me?.id ?? null,
			created_at: now,
			updated_at: now,
			rev: 0
		};
		await this.applyVisits([visit]);
		await this.enqueue(
			{
				id: uuid(),
				type: 'visit.create',
				at: now,
				data: {
					id: visit.id,
					household_id: visit.household_id,
					program_id: visit.program_id,
					visit_date: visit.visit_date,
					visited_at: visit.visited_at,
					quantity: visit.quantity,
					notes: visit.notes,
					override_reason: visit.override_reason
				}
			},
			`${input.program.name}: ${fullName(input.household)}`
		);
		return visit;
	}

	async voidVisit(visit: Visit, reason: string): Promise<void> {
		const now = new Date().toISOString();
		await this.applyVisits([
			{ ...visit, voided: true, void_reason: reason.trim(), updated_at: now }
		]);
		const household = this.households.get(visit.household_id);
		await this.enqueue(
			{ id: uuid(), type: 'visit.void', at: now, data: { id: visit.id, reason: reason.trim() } },
			`Undo visit: ${household ? fullName(household) : 'household'}`
		);
	}

	/** Online-only: erase a household's personal details (admins). */
	async deleteHousehold(id: string): Promise<void> {
		const { household } = await api.del<{ household: Household }>(`/api/households/${id}`);
		await this.applyHouseholds([household]);
	}

	/** Online-only: a household's full visit history, beyond what's kept offline. */
	async fetchHistory(id: string): Promise<Visit[]> {
		const { visits } = await api.get<{ visits: Visit[] }>(`/api/households/${id}/visits`);
		return visits;
	}

	/** Replace cached settings and programs after an admin edits them. */
	async refreshAfterAdminChange(): Promise<void> {
		await this.sync();
	}

	/* -------------------------------------------------------------- sync -- */

	/** Ask for a sync shortly, batching quick bursts of changes. */
	syncSoon(delay = 300): void {
		if (this.syncSoonTimer) clearTimeout(this.syncSoonTimer);
		this.syncSoonTimer = setTimeout(() => void this.sync(), delay);
	}

	/** Send queued changes, then download what changed elsewhere. */
	async sync(): Promise<void> {
		if (!this.store || this.session !== 'signed-in' || this.paused) return;
		if (this.running) {
			this.syncAgain = true;
			return this.running;
		}
		this.running = this.runSync();
		try {
			await this.running;
		} finally {
			this.running = null;
			if (this.syncAgain && !this.paused) {
				this.syncAgain = false;
				this.syncSoon(50);
			}
		}
	}

	private async runSync() {
		const generation = this.generation;
		this.syncing = true;
		try {
			await this.push(generation);
			await this.pull(generation);
			if (generation !== this.generation) return;
			this.lastSyncAt = new Date().toISOString();
			await this.store!.setMeta('lastSyncAt', this.lastSyncAt);
			this.syncError = null;
			this.reachable = true;
			this.needsSignIn = false;
		} catch (err) {
			if (err instanceof ApiError) {
				if (err.status === 401) {
					this.needsSignIn = true;
					this.reachable = true;
				} else if (err.offline) {
					this.reachable = false;
				} else {
					this.reachable = true;
					this.syncError = err.message;
				}
			} else {
				this.syncError = err instanceof Error ? err.message : String(err);
				console.error('[pantrybook] sync failed', err);
			}
		} finally {
			this.syncing = false;
		}
	}

	/** Stop syncing and wait for a sync in progress, before replacing the local copy. */
	private async quiesce() {
		this.paused = true;
		this.generation += 1;
		if (this.syncSoonTimer) clearTimeout(this.syncSoonTimer);
		while (this.running) {
			try {
				await this.running;
			} catch {
				// Errors are already reported by runSync.
			}
		}
	}

	private async enqueue(mutation: Mutation, label: string) {
		const entry: OutboxEntry = {
			mutation,
			label,
			status: 'pending',
			attempts: 0,
			created_at: mutation.at,
			user_id: this.me?.id
		};
		entry.seq = await this.store!.addOutbox(entry);
		this.outbox = [...this.outbox, entry];
		this.syncSoon();
	}

	private async push(generation: number) {
		const store = this.store!;
		for (;;) {
			const batch = this.myOutbox.filter((e) => e.status === 'pending').slice(0, PUSH_BATCH);
			if (batch.length === 0) return;
			const { results } = await api.post<SyncPushResponse>('/api/sync', {
				mutations: batch.map((e) => e.mutation)
			});
			if (generation !== this.generation) return;

			const done = new Set<number>();
			const failed = new Map<number, string>();
			let transient: string | null = null;
			const households: Household[] = [];
			const visits: Visit[] = [];

			for (let i = 0; i < batch.length; i++) {
				const entry = batch[i];
				const result = results[i];
				if (!result) break;
				if (result.household) households.push(result.household);
				if (result.visit) visits.push(result.visit);
				if (result.ok) {
					done.add(entry.seq!);
					for (const warning of result.warnings ?? []) toast.warning(warning);
				} else if (result.permanent) {
					failed.set(entry.seq!, result.error ?? 'The server could not accept this change.');
				} else {
					transient = result.error ?? 'Could not sync yet.';
					break;
				}
			}

			// A record changed again on this device while the batch was uploading (say, an Undo
			// right after a check-in) keeps its newer local version until that change uploads.
			const inBatch = new Set(batch.map((e) => e.seq));
			const newer = new Set(
				this.myOutbox
					.filter((e) => e.status === 'pending' && !inBatch.has(e.seq))
					.map((e) => e.mutation.data.id)
			);
			await this.applyHouseholds(households.filter((h) => !newer.has(h.id)));
			await this.applyVisits(visits.filter((v) => !newer.has(v.id)));

			for (const seq of done) await store.deleteOutbox(seq);
			const updated = new Map<number, OutboxEntry>();
			for (const entry of batch) {
				const error = failed.get(entry.seq!);
				if (error === undefined) continue;
				const next: OutboxEntry = {
					...entry,
					status: 'failed',
					error,
					attempts: entry.attempts + 1
				};
				await store.updateOutbox(next);
				updated.set(entry.seq!, next);
				toast.error(`Couldn't sync "${entry.label}": ${error}`);
			}
			// Rebuild from the current list: entries may have been added during the awaits.
			this.outbox = this.outbox
				.filter((e) => !done.has(e.seq!))
				.map((e) => updated.get(e.seq!) ?? e);

			if (transient) throw new Error(transient);
			if (done.size === 0 && failed.size === 0) return;
		}
	}

	private async pull(generation: number) {
		const store = this.store!;
		let cursor = (await store.getMeta<number>('cursor')) ?? 0;
		let knownServer = await store.getMeta<string>('serverId');
		for (let page = 0; page < 1000; page++) {
			const res = await api.get<SyncPullResponse>(`/api/sync?since=${cursor}`);
			if (generation !== this.generation) return;

			// A different database (a demo reset or a restored backup), or a change counter
			// that went backwards (an old backup copied into place): start again from scratch.
			const replaced = knownServer && res.server_id !== knownServer;
			const rewound = cursor > 0 && res.rev < cursor;
			if (replaced || rewound) {
				await this.wipeReplica();
				toast.info('The server data was replaced, so this device downloaded a fresh copy.');
				knownServer = res.server_id;
				await store.setMeta('serverId', res.server_id);
				cursor = 0;
				continue;
			}

			// Don't let a download overwrite a change that's still waiting to upload.
			const waiting = new Set(
				this.myOutbox.filter((e) => e.status === 'pending').map((e) => e.mutation.data.id)
			);
			await this.applyHouseholds(res.households.filter((h) => !waiting.has(h.id)));
			await this.applyVisits(res.visits.filter((v) => !waiting.has(v.id)));
			if (res.programs.length) await this.applyPrograms(res.programs);
			this.settings = res.settings;
			this.orgName = res.settings.org_name;
			this.users = new Map(res.users.map((u) => [u.id, u.display_name]));
			await store.setMeta('settings', res.settings);
			await store.setMeta('users', res.users);

			if (res.visit_window_start && res.visit_window_start !== this.visitWindowStart) {
				this.visitWindowStart = res.visit_window_start;
				await store.setMeta('visitWindowStart', res.visit_window_start);
				await this.pruneVisits(res.visit_window_start, waiting);
			}

			cursor = res.rev;
			knownServer = res.server_id;
			await store.setMeta('cursor', cursor);
			await store.setMeta('serverId', res.server_id);
			this.hasData = true;
			if (!res.more) return;
		}
	}

	private async applyHouseholds(rows: Household[]) {
		if (rows.length === 0) return;
		const next = new Map(this.households);
		for (const h of rows) next.set(h.id, h);
		this.households = next;
		await this.store!.putMany('households', rows);
	}

	private async applyVisits(rows: Visit[]) {
		if (rows.length === 0) return;
		const next = new Map(this.visits);
		for (const v of rows) next.set(v.id, v);
		this.visits = next;
		await this.store!.putMany('visits', rows);
	}

	private async applyPrograms(rows: Program[]) {
		const next = new Map(this.programs.map((p) => [p.id, p]));
		for (const p of rows) next.set(p.id, p);
		this.programs = [...next.values()];
		await this.store!.putMany('programs', rows);
	}

	private async removeLocal(kind: 'households' | 'visits', ids: string[]) {
		if (ids.length === 0) return;
		if (kind === 'households') {
			const next = new Map(this.households);
			for (const id of ids) next.delete(id);
			this.households = next;
		} else {
			const next = new Map(this.visits);
			for (const id of ids) next.delete(id);
			this.visits = next;
		}
		await this.store!.deleteMany(kind, ids);
	}

	/** Forget visits older than the offline window (they stay on the server). */
	private async pruneVisits(windowStart: string, keep: Set<string>) {
		const cutoff = addDays(windowStart, -1);
		const old = [...this.visits.values()].filter((v) => v.visit_date <= cutoff && !keep.has(v.id));
		await this.removeLocal(
			'visits',
			old.map((v) => v.id)
		);
	}

	private async wipeReplica() {
		const store = this.store!;
		await Promise.all([store.clear('households'), store.clear('visits'), store.clear('programs')]);
		for (const key of ['cursor', 'serverId', 'lastSyncAt', 'visitWindowStart']) {
			await store.setMeta(key, undefined);
		}
		this.households = new Map();
		this.visits = new Map();
		this.programs = [];
		this.hasData = false;
		this.lastSyncAt = null;
		this.visitWindowStart = '';
	}

	/* ------------------------------------------------------------ outbox -- */

	async retryFailed(): Promise<void> {
		const store = this.store!;
		const retry = new Set(this.failedEntries.map((e) => e.seq));
		const reset = (e: OutboxEntry): OutboxEntry => ({ ...e, status: 'pending', error: undefined });
		for (const e of this.outbox) if (retry.has(e.seq)) await store.updateOutbox(reset(e));
		this.outbox = this.outbox.map((e) => (retry.has(e.seq) ? reset(e) : e));
		await this.sync();
	}

	/**
	 * Give up on a change the server won't accept, and undo it on this device too, so it
	 * doesn't linger in limits and totals.
	 */
	async discard(entry: OutboxEntry): Promise<void> {
		if (entry.seq === undefined) return;
		await this.store!.deleteOutbox(entry.seq);
		this.outbox = this.outbox.filter((e) => e.seq !== entry.seq);
		const m = entry.mutation;
		let refresh = false;
		if (m.type === 'visit.create') {
			await this.removeLocal('visits', [m.data.id]);
		} else if (m.type === 'household.save') {
			const h = this.households.get(m.data.id);
			if (h && h.number === null) {
				// Never reached the server: remove it and anything recorded for it here.
				await this.removeLocal(
					'visits',
					this.householdVisits(h.id).map((v) => v.id)
				);
				await this.removeLocal('households', [h.id]);
			} else {
				refresh = true;
			}
		} else {
			refresh = true;
		}
		if (refresh) {
			if (this.reachable && this.pendingCount === 0) await this.redownload();
			else toast.info('Use "Re-download all data" on the Account page once you are back online.');
		}
	}

	/** Throw away this device's copy and download everything again. */
	async redownload(): Promise<void> {
		await this.quiesce();
		try {
			await this.wipeReplica();
		} finally {
			this.paused = false;
		}
		await this.sync();
	}
}

export const pantry = new Pantry();
