import { addDays, dayOfWeek, localISODate } from '#lib/shared/dates.ts';
import { evaluateEligibility } from '#lib/shared/limits.ts';
import type { HouseholdInput, Program } from '#lib/shared/types.ts';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.ts';
import { DEMO_PASSWORD } from './config.ts';
import { nextRev, nowISO, rotateServerId, type DB } from './db.ts';
import { saveHousehold } from './households.ts';
import { createProgram } from './programs.ts';
import { saveSettings } from './settings.ts';
import { createUser } from './users.ts';

/** Small deterministic PRNG so every demo reset produces the same town. */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FIRST =
	'Maria James Aisha Wei Carlos Fatima John Linh Dmitri Grace Jamal Sofia Ahmed Emily Luis Priya Robert Mei Kwame Ana David Yusuf Hannah Jose Nadia Michael Rosa Tariq Sarah Hiroshi Olga Daniel Amara Miguel Leila Thomas Zara Samuel Elena Omar Patricia Andre Keisha Viktor Lucia Brian Esperanza Kofi Ruth Ivan'.split(
		' '
	);
const LAST =
	'Garcia Johnson Nguyen Smith Hernandez Ali Williams Chen Brown Martinez Okafor Lopez Kim Davis Rodriguez Patel Miller Wilson Hassan Moore Taylor Anderson Thomas Jackson White Harris Martin Thompson Ramirez Lewis Robinson Walker Young Allen Ivanova Mensah Flores Rivera Cohen Sato Diaz Morales Petrov Baker Adeyemi'.split(
		' '
	);
const STREETS =
	'Oak St|Maple Ave|River Rd|Elm St|Cedar Ln|Washington Ave|Park Pl|Lincoln St|Hillside Dr|Mill St|Church St|Pine St|Lake View Dr|2nd Ave|Spring St|Orchard Way'.split(
		'|'
	);
const TOWNS: { city: string; zip: string; weight: number }[] = [
	{ city: 'Riverton', zip: '40121', weight: 5 },
	{ city: 'Riverton', zip: '40123', weight: 3 },
	{ city: 'Millbrook', zip: '40130', weight: 2 },
	{ city: 'East Haven', zip: '40144', weight: 2 },
	{ city: 'Cedar Falls', zip: '40152', weight: 1 }
];
const LANGUAGES = '|||||Spanish|Spanish|Arabic|Vietnamese|French'.split('|');
const DIETARY =
	'||||||Diabetic|No pork|Gluten-free|Peanut allergy|Vegetarian|Low sodium|Halal'.split('|');
const NOTES =
	'|||||||Prefers Saturday pickup|No car — needs help carrying boxes|Proxy pickup: neighbor (Linda)|Recently moved to the area|Has a baby due in spring'.split(
		'|'
	);
const OVERRIDE_REASONS = [
	'Emergency — house fire',
	'Lost job this week',
	'Extra family staying with them',
	'Coordinator approved'
];

/** The opening days of the demo pantry: Tuesday, Thursday and Saturday. */
const OPEN_DAYS = new Set([2, 4, 6]);

function weighted<T extends { weight: number }>(rand: () => number, items: T[]): T {
	const total = items.reduce((sum, i) => sum + i.weight, 0);
	let r = rand() * total;
	for (const item of items) {
		r -= item.weight;
		if (r <= 0) return item;
	}
	return items[items.length - 1];
}

function wipe(db: DB): void {
	db.exec(`
		DELETE FROM visits;
		DELETE FROM households;
		DELETE FROM programs;
		DELETE FROM sessions;
		DELETE FROM audit_log;
		DELETE FROM users;
		DELETE FROM settings;
	`);
	rotateServerId(db);
}

export interface DemoSummary {
	households: number;
	visits: number;
}

/**
 * Replace everything in the database with a fictional pantry: ~160 households and
 * six months of visits. Used by demo mode and `npm run seed:demo`.
 */
export async function seedDemo(db: DB, options: { households?: number; days?: number } = {}) {
	const householdCount = options.households ?? 160;
	const days = options.days ?? 180;
	const rand = mulberry32(20261104);
	const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

	const [adminHash, volunteerHash] = await Promise.all([
		hashPassword(DEMO_PASSWORD),
		hashPassword(DEMO_PASSWORD)
	]);

	const summary: DemoSummary = { households: 0, visits: 0 };

	db.transaction(() => {
		wipe(db);
		saveSettings(db, {
			org_name: 'Riverton Community Pantry',
			org_address: '120 Main Street, Riverton',
			org_phone: '(555) 010-2040',
			override_policy: 'anyone',
			week_starts_on: 0,
			recertify_months: 12
		});
		const admin = createUser(db, {
			username: 'admin',
			display_name: 'Alex Rivera',
			role: 'admin',
			password_hash: adminHash
		});
		const volunteer = createUser(db, {
			username: 'volunteer',
			display_name: 'Sam Lee',
			role: 'volunteer',
			password_hash: volunteerHash
		});
		const staff = [admin.id, volunteer.id, volunteer.id];

		const food = createProgram(db, {
			name: 'Food Pantry',
			unit: 'lbs',
			default_quantity: 30,
			limit_count: 4,
			limit_period: 'month',
			limit_days: null,
			active: true,
			sort_order: 1
		});
		const baby = createProgram(db, {
			name: 'Baby Closet',
			unit: 'items',
			default_quantity: 12,
			limit_count: 2,
			limit_period: 'month',
			limit_days: null,
			active: true,
			sort_order: 2
		});
		const clothing = createProgram(db, {
			name: 'Clothing Bank',
			unit: 'items',
			default_quantity: 8,
			limit_count: 1,
			limit_period: 'rolling',
			limit_days: 30,
			active: true,
			sort_order: 3
		});

		const today = localISODate();
		const start = addDays(today, -days);
		const openDays: string[] = [];
		for (let d = start; d <= today; d = addDays(d, 1)) {
			if (OPEN_DAYS.has(dayOfWeek(d)) || d === today) openDays.push(d);
		}

		const visitInsert = db.prepare(
			`INSERT INTO visits (id, household_id, program_id, visit_date, visited_at, quantity, adults,
			   children, seniors, notes, over_limit, override_reason, voided, void_reason, created_by,
			   created_at, updated_at, rev)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?, ?)`
		);

		for (let i = 0; i < householdCount; i++) {
			const town = weighted(rand, TOWNS);
			const roll = rand();
			const seniorsOnly = roll < 0.15;
			const input: HouseholdInput = {
				first_name: pick(FIRST),
				last_name: pick(LAST),
				phone: `(555) ${String(200 + Math.floor(rand() * 700))}-${String(
					1000 + Math.floor(rand() * 9000)
				)}`,
				email: rand() < 0.3 ? `family${i + 1}@example.org` : '',
				address: `${10 + Math.floor(rand() * 1990)} ${pick(STREETS)}`,
				city: town.city,
				state: 'KY',
				zip: town.zip,
				adults: seniorsOnly ? 0 : 1 + Math.floor(rand() * 2.4),
				children: seniorsOnly ? 0 : Math.floor(rand() * rand() * 5),
				seniors: seniorsOnly ? 1 + Math.floor(rand() * 2) : rand() < 0.15 ? 1 : 0,
				language: pick(LANGUAGES),
				dietary: pick(DIETARY),
				notes: pick(NOTES),
				income_eligible: rand() < 0.82,
				status: rand() < 0.06 ? 'inactive' : 'active',
				verified_at: ''
			};
			// Registration date somewhere in the window, earlier for most households.
			const registeredOffset = Math.floor(Math.pow(rand(), 2.2) * days);
			const registered = addDays(start, registeredOffset);
			input.verified_at = rand() < 0.12 ? addDays(registered, -400) : registered;

			const id = randomUUID();
			saveHousehold(db, { ...input, id, updated_at: `${registered}T15:00:00.000Z` }, admin.id);
			db.prepare(`UPDATE households SET created_at = ? WHERE id = ?`).run(
				`${registered}T15:00:00.000Z`,
				id
			);
			summary.households += 1;
			if (input.status === 'inactive') continue;

			// How often this household comes: regulars, monthly, and occasional visitors.
			const pattern = rand();
			const visitChance = pattern < 0.25 ? 0.42 : pattern < 0.7 ? 0.12 : 0.04;
			const history = new Map<string, string[]>();
			const record = (program: Program, date: string, quantity: number | null) => {
				const dates = history.get(program.id) ?? [];
				const ok = evaluateEligibility(program, dates, date, 0).allowed;
				const override = !ok && rand() < 0.08;
				if (!ok && !override) return;
				dates.push(date);
				history.set(program.id, dates);
				const minutes = 9 * 60 + Math.floor(rand() * 5 * 60);
				const visitedAt = new Date(
					`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
						minutes % 60
					).padStart(2, '0')}:00`
				).toISOString();
				visitInsert.run(
					randomUUID(),
					id,
					program.id,
					date,
					visitedAt,
					quantity,
					input.adults,
					input.children,
					input.seniors,
					'',
					override ? 1 : 0,
					override ? pick(OVERRIDE_REASONS) : '',
					pick(staff),
					nowISO(),
					nowISO(),
					nextRev(db)
				);
				summary.visits += 1;
			};

			for (const date of openDays) {
				if (date < registered) continue;
				const chance = date === today ? visitChance * 0.6 : visitChance;
				if (rand() > chance) continue;
				const size = input.adults + input.children + input.seniors;
				record(food, date, Math.round(18 + size * 6 + rand() * 10));
				if (input.children > 0 && rand() < 0.35) record(baby, date, 6 + Math.floor(rand() * 14));
				if (rand() < 0.12) record(clothing, date, 3 + Math.floor(rand() * 10));
			}
		}
	})();

	return summary;
}
