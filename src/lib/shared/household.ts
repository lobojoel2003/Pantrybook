import type { Household, HouseholdInput, ImportRow } from './types.ts';

export const MAX_MEMBERS_PER_GROUP = 30;

export const LIMITS = {
	name: 80,
	phone: 40,
	email: 120,
	address: 160,
	city: 80,
	state: 40,
	zip: 20,
	language: 40,
	dietary: 300,
	notes: 2000
} as const;

export function emptyHousehold(): HouseholdInput {
	return {
		first_name: '',
		last_name: '',
		phone: '',
		email: '',
		address: '',
		city: '',
		state: '',
		zip: '',
		adults: 1,
		children: 0,
		seniors: 0,
		language: '',
		dietary: '',
		notes: '',
		income_eligible: false,
		status: 'active',
		verified_at: ''
	};
}

export function householdSize(h: Pick<HouseholdInput, 'adults' | 'children' | 'seniors'>): number {
	return (h.adults || 0) + (h.children || 0) + (h.seniors || 0);
}

export function plural(n: number, one: string, many: string): string {
	return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function peopleCount(n: number): string {
	return plural(n, 'person', 'people');
}

/** "2 children · 1 adult · 0 seniors" */
export function memberBreakdown(
	h: Pick<HouseholdInput, 'adults' | 'children' | 'seniors'>
): string {
	return [
		plural(h.children, 'child', 'children'),
		plural(h.adults, 'adult', 'adults'),
		plural(h.seniors, 'senior', 'seniors')
	].join(' · ');
}

export function fullName(h: Pick<HouseholdInput, 'first_name' | 'last_name'>): string {
	return `${h.first_name} ${h.last_name}`.trim() || 'Unnamed household';
}

export function householdLabel(h: Pick<Household, 'number'>): string {
	return h.number ? `#${h.number}` : 'New';
}

export function digitsOnly(value: string): string {
	return value.replace(/\D+/g, '');
}

/** Formats 10-digit (or 11-digit with leading 1) North American numbers; leaves others alone. */
export function formatPhone(value: string): string {
	const digits = digitsOnly(value);
	const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
	if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
	return value.trim();
}

function clampCount(value: unknown, fallback: number): number {
	const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(MAX_MEMBERS_PER_GROUP, Math.max(0, Math.trunc(n)));
}

function clean(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/\r\n?/g, '\n')
		.trim()
		.slice(0, max);
}

/** Trim, collapse whitespace, clamp numbers and fill defaults. */
export function normalizeHousehold(input: Partial<HouseholdInput>): HouseholdInput {
	const base = emptyHousehold();
	const out: HouseholdInput = {
		first_name: clean(input.first_name, LIMITS.name),
		last_name: clean(input.last_name, LIMITS.name),
		phone: clean(input.phone, LIMITS.phone),
		email: clean(input.email, LIMITS.email).toLowerCase(),
		address: clean(input.address, LIMITS.address),
		city: clean(input.city, LIMITS.city),
		state: clean(input.state, LIMITS.state),
		zip: clean(input.zip, LIMITS.zip),
		adults: clampCount(input.adults, base.adults),
		children: clampCount(input.children, base.children),
		seniors: clampCount(input.seniors, base.seniors),
		language: clean(input.language, LIMITS.language),
		dietary: cleanMultiline(input.dietary, LIMITS.dietary),
		notes: cleanMultiline(input.notes, LIMITS.notes),
		income_eligible: Boolean(input.income_eligible),
		status: input.status === 'inactive' ? 'inactive' : 'active',
		verified_at: /^\d{4}-\d{2}-\d{2}$/.test(input.verified_at ?? '') ? input.verified_at! : ''
	};
	if (out.phone) out.phone = formatPhone(out.phone);
	return out;
}

export function validateHousehold(h: HouseholdInput): string[] {
	const problems: string[] = [];
	if (!h.first_name && !h.last_name) problems.push('Enter a first or last name.');
	if (householdSize(h) < 1) problems.push('A household needs at least one person.');
	if (h.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email))
		problems.push('That email address does not look right.');
	return problems;
}

/* --------------------------------------------------------------- search -- */

function fold(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface SearchIndexEntry {
	household: Household;
	words: string[];
	phone: string;
	name: string;
}

export function indexHousehold(h: Household): SearchIndexEntry {
	const name = fold(`${h.first_name} ${h.last_name}`);
	const words = fold(`${h.first_name} ${h.last_name} ${h.address} ${h.city} ${h.zip} ${h.email}`)
		.split(/[^a-z0-9@.]+/)
		.filter(Boolean);
	return { household: h, words, phone: digitsOnly(h.phone), name };
}

/**
 * Rank households for a free-text query. Matches household numbers, phone digits,
 * and name or address word prefixes. Every word in the query must match.
 */
export function searchHouseholds(
	index: SearchIndexEntry[],
	query: string,
	limit = 25
): Household[] {
	const q = fold(query.trim());
	if (!q) return [];
	const numberQuery = q.replace(/^#/, '');
	const digits = digitsOnly(q);
	const isNumeric = /^#?\d+$/.test(q);
	const tokens = q.split(/[^a-z0-9@.]+/).filter(Boolean);

	const scored: { h: Household; score: number }[] = [];
	for (const entry of index) {
		const h = entry.household;
		let score = 0;
		if (isNumeric) {
			if (h.number !== null && String(h.number) === numberQuery) score = 1000;
			else if (digits.length >= 3 && entry.phone.includes(digits))
				score = 500 + (entry.phone.endsWith(digits) ? 50 : 0);
			else if (h.zip && h.zip === numberQuery) score = 50;
		} else {
			let all = true;
			let tokenScore = 0;
			for (const token of tokens) {
				let best = 0;
				for (const word of entry.words) {
					if (word === token) best = Math.max(best, 30);
					else if (word.startsWith(token)) best = Math.max(best, 20);
					else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 5);
				}
				if (best === 0) {
					all = false;
					break;
				}
				tokenScore += best;
			}
			if (all) {
				score = tokenScore;
				if (entry.name.startsWith(q)) score += 40;
				else if (entry.name.includes(q)) score += 15;
			}
		}
		if (score > 0) {
			if (h.status === 'inactive') score -= 1;
			scored.push({ h, score });
		}
	}
	scored.sort(
		(a, b) =>
			b.score - a.score ||
			a.h.last_name.localeCompare(b.h.last_name) ||
			a.h.first_name.localeCompare(b.h.first_name)
	);
	return scored.slice(0, limit).map((s) => s.h);
}

/**
 * Households that look like the one being entered: same phone number, same street
 * address, or the same first and last name.
 */
export function findPossibleDuplicates(
	households: Iterable<Household>,
	draft: Pick<HouseholdInput, 'first_name' | 'last_name' | 'phone' | 'address' | 'zip'>,
	excludeId?: string
): Household[] {
	const phone = digitsOnly(draft.phone);
	const address = fold(draft.address).replace(/[^a-z0-9]/g, '');
	const first = fold(draft.first_name.trim());
	const last = fold(draft.last_name.trim());
	const out: Household[] = [];
	for (const h of households) {
		if (h.id === excludeId || h.deleted) continue;
		const samePhone = phone.length >= 7 && digitsOnly(h.phone).endsWith(phone.slice(-7));
		const hAddress = fold(h.address).replace(/[^a-z0-9]/g, '');
		const sameAddress =
			address.length >= 6 && hAddress === address && (!draft.zip || !h.zip || draft.zip === h.zip);
		const sameName =
			first.length > 0 &&
			last.length > 0 &&
			fold(h.first_name) === first &&
			fold(h.last_name) === last;
		if (samePhone || sameAddress || sameName) out.push(h);
		if (out.length >= 5) break;
	}
	return out;
}

/* --------------------------------------------------------------- import -- */

type ImportField = keyof ImportRow | 'household_size';

export const IMPORT_FIELDS: { field: ImportField; label: string; required?: boolean }[] = [
	{ field: 'first_name', label: 'First name', required: true },
	{ field: 'last_name', label: 'Last name', required: true },
	{ field: 'phone', label: 'Phone' },
	{ field: 'email', label: 'Email' },
	{ field: 'address', label: 'Street address' },
	{ field: 'city', label: 'City' },
	{ field: 'state', label: 'State' },
	{ field: 'zip', label: 'ZIP / postal code' },
	{ field: 'adults', label: 'Adults (18–64)' },
	{ field: 'children', label: 'Children (0–17)' },
	{ field: 'seniors', label: 'Seniors (65+)' },
	{ field: 'household_size', label: 'Household size (if no age breakdown)' },
	{ field: 'language', label: 'Language' },
	{ field: 'dietary', label: 'Dietary needs' },
	{ field: 'notes', label: 'Notes' },
	{ field: 'income_eligible', label: 'Income eligible (yes/no)' }
];

const SYNONYMS: Record<ImportField, string[]> = {
	first_name: ['first name', 'first', 'firstname', 'given name', 'fname', 'nombre'],
	last_name: ['last name', 'last', 'lastname', 'surname', 'family name', 'lname', 'apellido'],
	phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell', 'telefono'],
	email: ['email', 'e-mail', 'email address'],
	address: ['address', 'street', 'street address', 'address 1', 'address line 1', 'direccion'],
	city: ['city', 'town', 'ciudad'],
	state: ['state', 'province', 'region', 'st'],
	zip: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode', 'postal'],
	adults: ['adults', 'adults 18-64', 'number of adults', '# adults', 'adult'],
	children: ['children', 'kids', 'children 0-17', 'number of children', '# children', 'minors'],
	seniors: ['seniors', 'seniors 65+', 'elderly', 'number of seniors', '# seniors', 'senior'],
	household_size: [
		'household size',
		'size',
		'family size',
		'# in household',
		'number in household',
		'total members',
		'members'
	],
	language: ['language', 'preferred language', 'idioma'],
	dietary: ['dietary', 'dietary needs', 'diet', 'allergies', 'dietary restrictions'],
	notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
	income_eligible: ['income eligible', 'eligible', 'tefap', 'tefap eligible', 'income eligibility']
};

function normalizeHeader(header: string): string {
	return fold(header)
		.replace(/[_\-()]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Best-guess mapping from our import fields to the spreadsheet's column headers. */
export function guessColumnMapping(headers: string[]): Partial<Record<ImportField, string>> {
	const mapping: Partial<Record<ImportField, string>> = {};
	const used = new Set<string>();
	const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
	for (const { field } of IMPORT_FIELDS) {
		const candidates = SYNONYMS[field];
		const hit =
			normalized.find((h) => !used.has(h.raw) && candidates.includes(h.norm)) ??
			normalized.find(
				(h) => !used.has(h.raw) && candidates.some((c) => c.length > 3 && h.norm.startsWith(c))
			);
		if (hit) {
			mapping[field] = hit.raw;
			used.add(hit.raw);
		}
	}
	// A single "Name" column: split into first/last later.
	if (!mapping.first_name && !mapping.last_name) {
		const name = normalized.find((h) => ['name', 'full name', 'client name'].includes(h.norm));
		if (name) mapping.last_name = name.raw;
	}
	return mapping;
}

const YES = new Set(['y', 'yes', 'true', '1', 'x', 'si', 'sí', 'eligible']);

/** Turn one spreadsheet row into an import row using a column mapping. */
export function mapImportRow(
	record: Record<string, string>,
	mapping: Partial<Record<ImportField, string>>
): ImportRow {
	const get = (field: ImportField) => {
		const column = mapping[field];
		return column ? (record[column] ?? '').trim() : '';
	};
	let first = get('first_name');
	let last = get('last_name');
	if (!first && last.includes(',')) {
		// "Garcia, Maria"
		const [l, ...rest] = last.split(',');
		last = l.trim();
		first = rest.join(',').trim();
	} else if (!first && mapping.last_name && !mapping.first_name && last.includes(' ')) {
		// "Maria Garcia" in a single Name column
		const parts = last.split(/\s+/);
		last = parts.pop() ?? '';
		first = parts.join(' ');
	}
	const count = (field: ImportField) => {
		const raw = get(field);
		if (raw === '') return undefined;
		const n = Number.parseInt(raw, 10);
		return Number.isFinite(n) ? n : undefined;
	};
	let adults = count('adults');
	const children = count('children');
	const seniors = count('seniors');
	const size = count('household_size');
	if (adults === undefined && children === undefined && seniors === undefined && size) {
		adults = size;
	}
	return {
		first_name: first,
		last_name: last,
		phone: get('phone'),
		email: get('email'),
		address: get('address'),
		city: get('city'),
		state: get('state'),
		zip: get('zip'),
		adults,
		children,
		seniors,
		language: get('language'),
		dietary: get('dietary'),
		notes: get('notes'),
		income_eligible: YES.has(fold(get('income_eligible')))
	};
}
