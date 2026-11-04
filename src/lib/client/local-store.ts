import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Household, Mutation, Program, Visit } from '#lib/shared/types.ts';

/** A change made on this device that hasn't reached the server yet. */
export interface OutboxEntry {
	seq?: number;
	mutation: Mutation;
	/** Short description shown in the sync panel, such as "Check-in: Maria Garcia". */
	label: string;
	status: 'pending' | 'failed';
	error?: string;
	attempts: number;
	created_at: string;
	/** Who made the change; it uploads only while they are signed in. */
	user_id?: string;
}

interface PantrySchema extends DBSchema {
	households: { key: string; value: Household };
	visits: { key: string; value: Visit };
	programs: { key: string; value: Program };
	outbox: { key: number; value: OutboxEntry };
	meta: { key: string; value: { key: string; value: unknown } };
}

type DataStore = 'households' | 'visits' | 'programs';

/**
 * The device's offline copy of the data, kept in IndexedDB. Falls back to memory
 * (online-only) in browsers that block IndexedDB, such as some private windows.
 */
export interface LocalStore {
	persistent: boolean;
	all<S extends DataStore>(store: S): Promise<PantrySchema[S]['value'][]>;
	putMany<S extends DataStore>(store: S, rows: PantrySchema[S]['value'][]): Promise<void>;
	deleteMany(store: DataStore, keys: string[]): Promise<void>;
	clear(store: DataStore | 'outbox' | 'meta'): Promise<void>;
	getMeta<T>(key: string): Promise<T | undefined>;
	setMeta(key: string, value: unknown): Promise<void>;
	outbox(): Promise<OutboxEntry[]>;
	addOutbox(entry: OutboxEntry): Promise<number>;
	updateOutbox(entry: OutboxEntry): Promise<void>;
	deleteOutbox(seq: number): Promise<void>;
}

const DB_NAME = 'pantrybook';
const DB_VERSION = 1;

async function idbStore(): Promise<LocalStore> {
	const db: IDBPDatabase<PantrySchema> = await openDB<PantrySchema>(DB_NAME, DB_VERSION, {
		upgrade(database) {
			database.createObjectStore('households', { keyPath: 'id' });
			database.createObjectStore('visits', { keyPath: 'id' });
			database.createObjectStore('programs', { keyPath: 'id' });
			database.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
			database.createObjectStore('meta', { keyPath: 'key' });
		},
		blocking() {
			// A newer version of the app wants to upgrade the database: let it.
			db.close();
		}
	});

	return {
		persistent: true,
		all: (store) => db.getAll(store),
		async putMany(store, rows) {
			if (rows.length === 0) return;
			const tx = db.transaction(store, 'readwrite');
			for (const row of rows) void tx.store.put(row as never);
			await tx.done;
		},
		async deleteMany(store, keys) {
			if (keys.length === 0) return;
			const tx = db.transaction(store, 'readwrite');
			for (const key of keys) void tx.store.delete(key);
			await tx.done;
		},
		clear: (store) => db.clear(store),
		async getMeta<T>(key: string) {
			return (await db.get('meta', key))?.value as T | undefined;
		},
		async setMeta(key, value) {
			await db.put('meta', { key, value });
		},
		outbox: () => db.getAll('outbox'),
		addOutbox: (entry) => db.add('outbox', entry),
		async updateOutbox(entry) {
			await db.put('outbox', entry);
		},
		deleteOutbox: (seq) => db.delete('outbox', seq)
	};
}

function memoryStore(): LocalStore {
	const tables = {
		households: new Map<string, Household>(),
		visits: new Map<string, Visit>(),
		programs: new Map<string, Program>()
	};
	const meta = new Map<string, unknown>();
	const outbox = new Map<number, OutboxEntry>();
	let seq = 0;
	return {
		persistent: false,
		all: async (store) => [...tables[store].values()] as never,
		async putMany(store, rows) {
			for (const row of rows) (tables[store] as Map<string, { id: string }>).set(row.id, row);
		},
		async deleteMany(store, keys) {
			for (const key of keys) tables[store].delete(key);
		},
		async clear(store) {
			if (store === 'outbox') outbox.clear();
			else if (store === 'meta') meta.clear();
			else tables[store].clear();
		},
		getMeta: async <T>(key: string) => meta.get(key) as T | undefined,
		async setMeta(key, value) {
			meta.set(key, value);
		},
		outbox: async () => [...outbox.values()],
		async addOutbox(entry) {
			seq += 1;
			outbox.set(seq, { ...entry, seq });
			return seq;
		},
		async updateOutbox(entry) {
			if (entry.seq !== undefined) outbox.set(entry.seq, entry);
		},
		async deleteOutbox(key) {
			outbox.delete(key);
		}
	};
}

export async function openLocalStore(): Promise<LocalStore> {
	try {
		if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
		return await idbStore();
	} catch (err) {
		console.warn('[pantrybook] offline storage unavailable, using memory only', err);
		return memoryStore();
	}
}
