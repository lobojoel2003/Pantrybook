import { describe, expect, it } from 'vitest';
import {
	emptyHousehold,
	findPossibleDuplicates,
	formatPhone,
	guessColumnMapping,
	indexHousehold,
	mapImportRow,
	normalizeHousehold,
	searchHouseholds,
	validateHousehold
} from './household.ts';
import type { Household } from './types.ts';

let n = 1000;
function household(patch: Partial<Household>): Household {
	n += 1;
	return {
		...emptyHousehold(),
		id: `id-${n}`,
		number: n,
		created_at: '',
		updated_at: '',
		deleted: false,
		rev: n,
		...patch
	};
}

const people = [
	household({
		first_name: 'Maria',
		last_name: 'García',
		phone: '(555) 201-3344',
		address: '12 Oak St'
	}),
	household({ first_name: 'Mario', last_name: 'Gomez', phone: '555-777-8899', city: 'Millbrook' }),
	household({ first_name: 'James', last_name: 'Martin', phone: '', zip: '40121' }),
	household({ first_name: 'Ann', last_name: 'Marie', status: 'inactive' })
];
const index = people.map(indexHousehold);

describe('household helpers', () => {
	it('normalises input', () => {
		const h = normalizeHousehold({
			first_name: '  Maria ',
			last_name: 'Garcia',
			phone: '5552013344',
			email: ' Maria@Example.ORG ',
			adults: 99,
			children: -2
		});
		expect(h.first_name).toBe('Maria');
		expect(h.phone).toBe('(555) 201-3344');
		expect(h.email).toBe('maria@example.org');
		expect(h.adults).toBe(30);
		expect(h.children).toBe(0);
		expect(h.status).toBe('active');
	});

	it('formats North American phone numbers only', () => {
		expect(formatPhone('1-555-201-3344')).toBe('(555) 201-3344');
		expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
	});

	it('validates required details', () => {
		expect(validateHousehold({ ...emptyHousehold(), adults: 0 })).toHaveLength(2);
		expect(validateHousehold({ ...emptyHousehold(), last_name: 'Lee' })).toEqual([]);
	});

	it('searches by name prefix, ignoring accents', () => {
		expect(searchHouseholds(index, 'garcia').map((h) => h.first_name)).toEqual(['Maria']);
		expect(searchHouseholds(index, 'mar').map((h) => h.first_name)).toEqual([
			'Maria',
			'Mario',
			'James',
			'Ann'
		]);
		expect(searchHouseholds(index, 'maria gar').map((h) => h.first_name)).toEqual(['Maria']);
	});

	it('searches by household number and phone digits', () => {
		const target = people[2];
		expect(searchHouseholds(index, `#${target.number}`)[0].id).toBe(target.id);
		expect(searchHouseholds(index, '8899')[0].first_name).toBe('Mario');
	});

	it('spots likely duplicates', () => {
		const dupes = findPossibleDuplicates(people, {
			first_name: 'Someone',
			last_name: 'Else',
			phone: '555.201.3344',
			address: '',
			zip: ''
		});
		expect(dupes.map((h) => h.first_name)).toEqual(['Maria']);
		expect(
			findPossibleDuplicates(people, {
				first_name: 'maria',
				last_name: 'garcia',
				phone: '',
				address: '',
				zip: ''
			})
		).toHaveLength(1);
		expect(
			findPossibleDuplicates(
				people,
				{ first_name: 'Maria', last_name: 'García', phone: '', address: '', zip: '' },
				people[0].id
			)
		).toHaveLength(0);
	});

	it('guesses spreadsheet columns and maps rows', () => {
		const headers = ['Last Name', 'First Name', 'Phone #', 'Zip Code', 'Household Size', 'TEFAP'];
		const mapping = guessColumnMapping(headers);
		expect(mapping.first_name).toBe('First Name');
		expect(mapping.last_name).toBe('Last Name');
		expect(mapping.zip).toBe('Zip Code');
		expect(mapping.household_size).toBe('Household Size');
		const row = mapImportRow(
			{ 'Last Name': 'Diaz', 'First Name': 'Ana', 'Household Size': '4', TEFAP: 'Yes' },
			mapping
		);
		expect(row).toMatchObject({
			first_name: 'Ana',
			last_name: 'Diaz',
			adults: 4,
			income_eligible: true
		});
	});

	it('splits a single name column', () => {
		const mapping = guessColumnMapping(['Name']);
		expect(mapImportRow({ Name: 'Garcia, Maria' }, mapping)).toMatchObject({
			first_name: 'Maria',
			last_name: 'Garcia'
		});
		expect(mapImportRow({ Name: 'Maria de la Cruz' }, mapping)).toMatchObject({
			first_name: 'Maria de la',
			last_name: 'Cruz'
		});
	});
});
